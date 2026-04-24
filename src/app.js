"use strict";
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { getConfig } = require("./config");
const { logger } = require("./logger");
const { sendError, sendSuccess } = require("./utils/responses");
const { NotificationQueue } = require("./queue/queue");
const { sendTelegram } = require("./channels/telegram");
const { sendEmail } = require("./channels/email");
const { sendWebhook } = require("./channels/webhook");
const notificationsRoutes = require("./routes/notifications");

function createApp(options = {}) {
  const app = express();
  const config = getConfig(options);

  app.use(express.json());
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origen no permitido por CORS"));
    },
  }));
  app.use(rateLimit({
    windowMs: config.requestWindowMs,
    limit: config.requestLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Demasiadas solicitudes",
      data: null,
      error: "RATE_LIMIT_EXCEEDED",
    },
  }));

  const queue = options.queue || new NotificationQueue(config);
  queue.registerHandler("telegram", sendTelegram);
  queue.registerHandler("email", sendEmail);
  queue.registerHandler("webhook", sendWebhook);

  app.locals.queue = queue;

  app.get("/health", (req, res) => {
    return sendSuccess(res, {
      message: "Servicio saludable",
      data: {
        status: "ok",
        service: config.serviceName,
        version: config.version,
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        channels: ["telegram", "email", "webhook"],
        queue: queue.stats(),
      },
    });
  });

  app.get("/metrics", (req, res) => {
    return sendSuccess(res, {
      message: "Metricas del servicio",
      data: {
        uptime: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        queue: queue.stats(),
      },
    });
  });

  app.use("/", notificationsRoutes);

  app.use((req, res) => {
    return sendError(res, { statusCode: 404, message: "Ruta no encontrada" });
  });

  app.use((err, req, res, next) => {
    logger.error("request failed", {
      error: err.message,
      method: req.method,
      path: req.originalUrl,
    });
    return sendError(res, { statusCode: 500, message: "Error interno del servidor", details: err.message });
  });

  return { app, queue };
}

module.exports = { createApp };
