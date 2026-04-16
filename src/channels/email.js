"use strict";
/**
 * Canal de notificaciones Email via SMTP (nodemailer).
 */
const nodemailer = require("nodemailer");

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    throw new Error("Email: SMTP_HOST no configurado");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Envía un email.
 * @param {object} payload - { to, subject, text?, html?, from? }
 */
async function sendEmail(payload) {
  const { to, subject, text, html, from } = payload;

  if (!to || !subject || (!text && !html)) {
    throw new Error("Email: to, subject y text/html son requeridos");
  }

  const transport = createTransport();
  const fromAddress = from || process.env.SMTP_FROM || `notificaciones@${process.env.SMTP_HOST}`;

  const result = await transport.sendMail({
    from: fromAddress,
    to,
    subject,
    text,
    html,
  });

  return { messageId: result.messageId };
}

module.exports = { sendEmail };
