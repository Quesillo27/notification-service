"use strict";

function sendSuccess(res, { statusCode = 200, data = null, message = "OK" }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
}

function sendError(res, { statusCode = 500, message = "Error interno del servidor", details = null }) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: details || message,
  });
}

module.exports = { sendSuccess, sendError };
