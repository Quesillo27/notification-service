FROM node:20-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runtime

WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

VOLUME ["/app/data"]

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV QUEUE_DB_PATH=/app/data/queue.db

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
