"use strict";
/**
 * Canal de notificaciones Telegram.
 * Usa Bot API directamente sin dependencia de python-telegram-bot.
 */
const fetch = require("node-fetch");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Envía un mensaje de Telegram.
 * @param {object} payload - { chat_id, text, parse_mode? }
 */
async function sendTelegram(payload) {
  const { chat_id, text, parse_mode } = payload;

  if (!chat_id || !text) {
    throw new Error("Telegram: chat_id y text son requeridos");
  }

  const token = payload.token || TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Telegram: TELEGRAM_BOT_TOKEN no configurado");
  }

  const body = { chat_id, text };
  if (parse_mode) body.parse_mode = parse_mode;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 10000,
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || JSON.stringify(data)}`);
  }

  return data;
}

module.exports = { sendTelegram };
