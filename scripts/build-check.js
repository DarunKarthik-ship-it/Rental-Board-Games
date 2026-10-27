// Build check. There is no bundler (plain HTML/CSS/JS), so "build" means: the server modules
// load, migrations apply to a fresh database, the app assembles, and every file the browser
// references or imports actually exists.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const problems = [];

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { load } = require('../src/config');

const db = openDatabase(':memory:');
const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
if (adminCount !== 0) problems.push('Fresh database must not contain an admin.');
createApp({ db, config: load({ NODE_ENV: 'test' }), logger: { info() {}, warn() {}, error() {} } });
db.close();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// Resolve a browser path ('/js/app.js' from public/, '/admin-assets/x.js' from admin-ui/).
function resolveBrowserPath(spec, fromFile) {
  if (spec.startsWith('/admin-assets/')) return path.join(root, 'admin-ui', spec.slice(14));
  if (spec.startsWith('/')) return path.join(root, 'public', spec);
  return path.resolve(path.dirname(fromFile), spec);
}

const importRe = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
let checked = 0;
for (const file of [...walk(path.join(root, 'public')), ...walk(path.join(root, 'admin-ui'))]) {
  if (!file.endsWith('.js')) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(importRe)) {
    const spec = m[1];
    if (!spec.startsWith('/') && !spec.startsWith('.')) continue;
    checked++;
    if (!fs.existsSync(resolveBrowserPath(spec, file)))
      problems.push(`${path.relative(root, file)} imports missing file ${spec}`);
  }
}

const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const m of index.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  checked++;
  if (!fs.existsSync(path.join(root, 'public', m[1])))
    problems.push(`index.html references missing ${m[1]}`);
}

if (problems.length) {
  console.error('Build check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.info(
  `Build check passed: schema v${version}, app assembles, ${checked} references resolve.`,
);
