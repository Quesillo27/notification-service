"use strict";
/**
 * Canal de notificaciones Webhook.
 * Hace POST al URL configurado con el payload.
 */
const fetch = require("node-fetch");

/**
 * Envía una notificación vía webhook.
 * @param {object} payload - { url, body, headers?, method? }
 */
async function sendWebhook(payload) {
  const { url, body, headers = {}, method = "POST" } = payload;

  if (!url) {
    throw new Error("Webhook: url es requerido");
  }

  const requestBody = typeof body === "string" ? body : JSON.stringify(body || {});
  const requestHeaders = {
    "Content-Type": "application/json",
    "User-Agent": "notification-service/1.0",
    ...headers,
  };

  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
    timeout: 10000,
  });

  if (!res.ok) {
    throw new Error(`Webhook respondió con status ${res.status}: ${url}`);
  }

  let responseBody;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = await res.text();
  }

  return { status: res.status, body: responseBody };
}

module.exports = { sendWebhook };
