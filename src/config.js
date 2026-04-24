"use strict";

const path = require("path");

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getConfig(overrides = {}) {
  return {
    serviceName: "notification-service",
    version: overrides.version || process.env.npm_package_version || "1.1.0",
    port: parseInteger(overrides.port || process.env.PORT, 3000),
    queueDbPath: overrides.dbPath || process.env.QUEUE_DB_PATH || path.join(process.cwd(), "queue.db"),
    maxRetries: parseInteger(overrides.maxRetries || process.env.MAX_RETRIES, 3),
    baseRetryDelayMs: parseInteger(overrides.baseRetryDelayMs || process.env.BASE_RETRY_DELAY_MS, 1000),
    workerIntervalMs: parseInteger(overrides.workerIntervalMs || process.env.WORKER_INTERVAL_MS, 5000),
    requestLimit: parseInteger(overrides.requestLimit || process.env.RATE_LIMIT_MAX, 100),
    requestWindowMs: parseInteger(overrides.requestWindowMs || process.env.RATE_LIMIT_WINDOW_MS, 60000),
    allowedOrigins: overrides.allowedOrigins || parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
    allowPrivateWebhookHosts:
      overrides.allowPrivateWebhookHosts || process.env.ALLOW_PRIVATE_WEBHOOK_HOSTS === "true",
  };
}

module.exports = { getConfig };
