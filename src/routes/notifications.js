"use strict";
const express = require("express");

const router = express.Router();

// La cola se inyecta vía app.locals
function getQueue(req) {
  return req.app.locals.queue;
}

// POST /notify — enviar notificación (inmediato o encolado)
router.post("/notify", async (req, res) => {
  const { channel, payload, async: isAsync = true } = req.body;

  const validChannels = ["telegram", "email", "webhook"];
  if (!channel || !validChannels.includes(channel)) {
    return res.status(400).json({
      error: `channel requerido. Válidos: ${validChannels.join(", ")}`
    });
  }

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "payload debe ser un objeto" });
  }

  const queue = getQueue(req);

  if (isAsync) {
    // Encolar y retornar ID inmediatamente
    const id = queue.enqueue(channel, payload);
    return res.status(202).json({
      id,
      status: "queued",
      channel,
      message: "Notificación encolada"
    });
  } else {
    // Envío síncrono
    const handler = queue.handlers[channel];
    if (!handler) {
      return res.status(400).json({ error: `No hay handler para canal: ${channel}` });
    }
    try {
      const result = await handler(payload);
      return res.json({ status: "sent", channel, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
});

// POST /notify/bulk — enviar múltiples notificaciones
router.post("/notify/bulk", async (req, res) => {
  const { notifications } = req.body;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return res.status(400).json({ error: "notifications debe ser un array no vacío" });
  }

  if (notifications.length > 100) {
    return res.status(400).json({ error: "Máximo 100 notificaciones por bulk" });
  }

  const queue = getQueue(req);
  const validChannels = ["telegram", "email", "webhook"];
  const results = [];

  for (const notif of notifications) {
    const { channel, payload } = notif;
    if (!validChannels.includes(channel) || !payload) {
      results.push({ status: "error", error: `canal inválido o payload faltante` });
      continue;
    }
    const id = queue.enqueue(channel, payload);
    results.push({ id, status: "queued", channel });
  }

  res.status(202).json({ results, total: results.length });
});

// GET /notify/:id — estado de una notificación
router.get("/notify/:id", (req, res) => {
  const queue = getQueue(req);
  const notification = queue.getStatus(req.params.id);
  if (!notification) {
    return res.status(404).json({ error: "Notificación no encontrada" });
  }
  res.json(notification);
});

// GET /notifications — listar notificaciones
router.get("/notifications", (req, res) => {
  const queue = getQueue(req);
  const { status, channel, limit } = req.query;
  const notifications = queue.list({
    status,
    channel,
    limit: limit ? parseInt(limit) : 50
  });
  res.json({ notifications, total: notifications.length });
});

// GET /stats — estadísticas de la cola
router.get("/stats", (req, res) => {
  const queue = getQueue(req);
  res.json(queue.stats());
});

module.exports = router;
