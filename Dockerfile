# better-sqlite3 has a native Node addon. Build it with the Python and C++ toolchain in
# this stage, then copy node_modules into the same Alpine/Node runtime for ABI compatibility.
FROM node:22-alpine AS dependencies
WORKDIR /build
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/rentals.sqlite

RUN apk add --no-cache dumb-init \
    && addgroup -S app \
    && adduser -S -G app app \
    && mkdir -p /app/data \
    && chown -R app:app /app

COPY --from=dependencies --chown=app:app /build/node_modules ./node_modules
COPY --chown=app:app package.json ./package.json
COPY --chown=app:app src ./src
COPY --chown=app:app public ./public
COPY --chown=app:app admin-ui ./admin-ui

USER app
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
