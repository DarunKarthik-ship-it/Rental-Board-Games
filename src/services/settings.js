// Reads and writes settings and delivery areas.

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getBufferDays(db) {
  const n = Number(getSetting(db, 'buffer_days'));
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

function listAreas(db) {
  return db
    .prepare('SELECT id, name, delivery_fee, time_note FROM areas ORDER BY id')
    .all()
    .map((a) => ({ id: a.id, name: a.name, deliveryFee: a.delivery_fee, timeNote: a.time_note }));
}

/** Everything the admin can edit, plus the fixed business name. */
function getSettings(db) {
  return {
    businessName: getSetting(db, 'business_name'),
    adminWhatsapp: getSetting(db, 'admin_whatsapp'),
    bufferDays: getBufferDays(db),
    areas: listAreas(db),
  };
}

/** Persist validated settings atomically. */
function saveSettings(db, data) {
  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const updateArea = db.prepare('UPDATE areas SET delivery_fee = ?, time_note = ? WHERE id = ?');
  db.transaction(() => {
    setSetting.run('admin_whatsapp', data.adminWhatsapp);
    setSetting.run('buffer_days', String(data.bufferDays));
    for (const a of data.areas) updateArea.run(a.deliveryFee, a.timeNote, a.id);
  })();
}

module.exports = { getSetting, getBufferDays, listAreas, getSettings, saveSettings };
