"use strict";
const express = require("express");
const { sendSuccess, sendError } = require("../utils/responses");

const router = express.Router();
const VALID_CHANNELS = ["telegram", "email", "webhook"];
const VALID_STATUSES = ["pending", "processing", "sent", "failed"];

function getQueue(req) {
  return req.app.locals.queue;
}

router.post("/notify", async (req, res) => {
  const { channel, payload, async: isAsync = true } = req.body;

  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return sendError(res, {
      statusCode: 400,
      message: `channel requerido. Validos: ${VALID_CHANNELS.join(", ")}`,
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return sendError(res, { statusCode: 400, message: "payload debe ser un objeto" });
  }

  if (typeof isAsync !== "boolean") {
    return sendError(res, {
      statusCode: 400,
      message: "async debe ser booleano",
    });
  }

  const queue = getQueue(req);

  if (isAsync) {
    const id = queue.enqueue(channel, payload);
    return sendSuccess(res, {
      statusCode: 202,
      message: "Notificacion encolada",
      data: { id, status: "queued", channel },
    });
  }

  const handler = queue.handlers[channel];
  if (!handler) {
    return sendError(res, { statusCode: 400, message: `No hay handler para canal: ${channel}` });
  }

  try {
    const result = await handler(payload);
    return sendSuccess(res, {
      message: "Notificacion enviada",
      data: { status: "sent", channel, result },
    });
  } catch (err) {
    return sendError(res, {
      statusCode: 500,
      message: "No se pudo enviar la notificacion",
      details: err.message,
    });
  }
});

router.post("/notify/bulk", async (req, res) => {
  const { notifications } = req.body;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return sendError(res, { statusCode: 400, message: "notifications debe ser un array no vacio" });
  }

  if (notifications.length > 100) {
    return sendError(res, { statusCode: 400, message: "Maximo 100 notificaciones por bulk" });
  }

  const queue = getQueue(req);
  const results = [];

  for (const notification of notifications) {
    const { channel, payload } = notification;
    if (!VALID_CHANNELS.includes(channel) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      results.push({ success: false, error: "canal invalido o payload faltante" });
      continue;
    }

    const id = queue.enqueue(channel, payload);
    results.push({ success: true, id, status: "queued", channel });
  }

  return sendSuccess(res, {
    statusCode: 202,
    message: "Bulk encolado",
    data: { results, total: results.length },
  });
});

router.get("/notify/:id", (req, res) => {
  const queue = getQueue(req);
  const notification = queue.getStatus(req.params.id);
  if (!notification) {
    return sendError(res, { statusCode: 404, message: "Notificacion no encontrada" });
  }

  return sendSuccess(res, { message: "Notificacion encontrada", data: notification });
});

router.get("/notifications", (req, res) => {
  const queue = getQueue(req);
  const { status, channel, limit, offset } = req.query;
  const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
  const parsedOffset = offset ? Number.parseInt(offset, 10) : 0;

  if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return sendError(res, { statusCode: 400, message: "limit debe estar entre 1 y 100" });
  }

  if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
    return sendError(res, { statusCode: 400, message: "offset debe ser mayor o igual a 0" });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return sendError(res, {
      statusCode: 400,
      message: `status invalido. Validos: ${VALID_STATUSES.join(", ")}`,
    });
  }

  if (channel && !VALID_CHANNELS.includes(channel)) {
    return sendError(res, {
      statusCode: 400,
      message: `channel invalido. Validos: ${VALID_CHANNELS.join(", ")}`,
    });
  }

  const notifications = queue.list({
    status,
    channel,
    limit: parsedLimit,
    offset: parsedOffset,
  });

  return sendSuccess(res, {
    message: "Listado de notificaciones",
    data: {
      notifications,
      total: notifications.length,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
      },
    },
  });
});

router.get("/stats", (req, res) => {
  const queue = getQueue(req);
  return sendSuccess(res, { message: "Estadisticas de la cola", data: queue.stats() });
});

module.exports = router;
