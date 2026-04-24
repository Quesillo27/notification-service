"use strict";
require("dotenv").config({ path: ".env" });

const { getConfig } = require("./config");
const { logger } = require("./logger");
const { createApp } = require("./app");

const config = getConfig();
const { app, queue } = createApp();

queue.startWorker();

const server = app.listen(config.port, () => {
  logger.info("server started", {
    port: config.port,
    channels: ["telegram", "email", "webhook"],
  });
});

process.on("SIGTERM", () => {
  logger.info("sigterm received, shutting down");
  queue.stopWorker();
  server.close(() => process.exit(0));
});
