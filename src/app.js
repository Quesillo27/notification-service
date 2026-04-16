"use strict";
const express = require("express");
const { NotificationQueue } = require("./queue/queue");
const { sendTelegram } = require("./channels/telegram");
const { sendEmail } = require("./channels/email");
const { sendWebhook } = require("./channels/webhook");
const notificationsRoutes = require("./routes/notifications");

function createApp(options = {}) {
  const app = express();
  app.use(express.json());
  app.set("trust proxy", 1);

  // Inicializar cola
  const queue = options.queue || new NotificationQueue(options.dbPath || ":memory:");

  // Registrar handlers de canales
  queue.registerHandler("telegram", sendTelegram);
  queue.registerHandler("email", sendEmail);
  queue.registerHandler("webhook", sendWebhook);

  // Inyectar cola en app
  app.locals.queue = queue;

  // Health check
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "notification-service",
      timestamp: new Date().toISOString(),
      channels: ["telegram", "email", "webhook"],
      queue: queue.stats()
    });
  });

  // Rutas
  app.use("/", notificationsRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error("[error]", err);
    res.status(500).json({ error: "Error interno del servidor" });
  });

  return { app, queue };
}

module.exports = { createApp };
