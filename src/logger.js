"use strict";

function write(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(`${output}\n`);
    return;
  }

  process.stdout.write(`${output}\n`);
}

const logger = {
  info(message, context) {
    write("info", message, context);
  },
  warn(message, context) {
    write("warn", message, context);
  },
  error(message, context) {
    write("error", message, context);
  },
};

module.exports = { logger };
