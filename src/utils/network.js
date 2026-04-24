"use strict";

const net = require("net");

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isPrivateIpv4(ip) {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith("169.254.")
  );
}

function isPrivateIpv6(ip) {
  return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

function validateWebhookUrl(url, allowPrivateHosts = false) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Webhook: url debe ser una URL valida");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Webhook: solo se permiten URLs http o https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!allowPrivateHosts && BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("Webhook: no se permiten destinos locales o privados");
  }

  const ipVersion = net.isIP(hostname);
  if (!allowPrivateHosts && ipVersion === 4 && isPrivateIpv4(hostname)) {
    throw new Error("Webhook: no se permiten destinos locales o privados");
  }

  if (!allowPrivateHosts && ipVersion === 6 && isPrivateIpv6(hostname)) {
    throw new Error("Webhook: no se permiten destinos locales o privados");
  }

  return parsed.toString();
}

module.exports = { validateWebhookUrl };
