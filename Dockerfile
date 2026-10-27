# Multi-stage build for Board Game Rentals
# Stage 1: Build stage (not used for this app, but shows full stages for clarity)
FROM node:22-alpine AS dependencies
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Final runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy app code
COPY . .

# Copy production dependencies from dependencies stage
COPY --from=dependencies /build/node_modules ./node_modules

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run as non-root user
RUN addgroup -g 1000 app && adduser -D -u 1000 -G app app
USER app

EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
