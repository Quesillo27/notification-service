"use strict";
/**
 * Canal de notificaciones Webhook.
 * Hace POST al URL configurado con el payload.
 */
const fetch = require("node-fetch");
const { getConfig } = require("../config");
const { validateWebhookUrl } = require("../utils/network");

async function sendWebhook(payload) {
  const { url, body, headers = {}, method = "POST" } = payload;

  if (!url) {
    throw new Error("Webhook: url es requerido");
  }

  const normalizedUrl = validateWebhookUrl(url, getConfig().allowPrivateWebhookHosts);
  const normalizedMethod = String(method).toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH"].includes(normalizedMethod)) {
    throw new Error("Webhook: method debe ser GET, POST, PUT o PATCH");
  }

  const requestBody = typeof body === "string" ? body : JSON.stringify(body || {});
  const requestHeaders = {
    "Content-Type": "application/json",
    "User-Agent": "notification-service/1.1",
    ...headers,
  };

  const res = await fetch(normalizedUrl, {
    method: normalizedMethod,
    headers: requestHeaders,
    body: normalizedMethod === "GET" ? undefined : requestBody,
    timeout: 10000,
  });

  if (!res.ok) {
    throw new Error(`Webhook respondió con status ${res.status}: ${normalizedUrl}`);
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
