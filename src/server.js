"use strict";
require("dotenv").config({ path: ".env" });

const { createApp } = require("./app");

const PORT = parseInt(process.env.PORT || "3000");

const { app, queue } = createApp();

// Iniciar worker de cola
queue.startWorker();

const server = app.listen(PORT, () => {
  console.log(`[server] Notification Service corriendo en puerto ${PORT}`);
  console.log(`[server] Canales disponibles: telegram, email, webhook`);
});

process.on("SIGTERM", () => {
  console.log("[server] SIGTERM recibido, cerrando...");
  queue.stopWorker();
  server.close(() => process.exit(0));
});
