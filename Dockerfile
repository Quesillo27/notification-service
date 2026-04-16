FROM node:20-slim

WORKDIR /app

RUN useradd -m -u 1000 appuser && mkdir -p /app/data && chown appuser /app/data

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

VOLUME ["/app/data"]

USER appuser

EXPOSE 3000

ENV QUEUE_DB_PATH=/app/data/queue.db

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
