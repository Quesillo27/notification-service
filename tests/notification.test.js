"use strict";
const request = require("supertest");
const { createApp } = require("../src/app");
const { NotificationQueue } = require("../src/queue/queue");

jest.mock("../src/channels/telegram", () => ({
  sendTelegram: jest.fn().mockResolvedValue({ ok: true, result: { message_id: 1 } })
}));

jest.mock("../src/channels/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: "test-msg-id" })
}));

jest.mock("../src/channels/webhook", () => ({
  sendWebhook: jest.fn().mockResolvedValue({ status: 200, body: {} })
}));

const { sendTelegram } = require("../src/channels/telegram");

let app;
let queue;

beforeEach(() => {
  jest.clearAllMocks();
  const result = createApp({ dbPath: ":memory:" });
  app = result.app;
  queue = result.queue;
});

afterEach(() => {
  queue.close();
});

describe("GET /health", () => {
  test("retorna respuesta estandar con metadata del servicio", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.channels).toContain("telegram");
    expect(res.body.data.queue).toHaveProperty("retryScheduled");
  });
});

describe("GET /metrics", () => {
  test("expone uptime, memoria y estado de cola", async () => {
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("uptime");
    expect(res.body.data).toHaveProperty("memory");
    expect(res.body.data.queue).toHaveProperty("total");
  });
});

describe("POST /notify (async)", () => {
  test("encola notificacion Telegram con respuesta uniforme", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "123", text: "test" } });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("queued");
    expect(res.body.data).toHaveProperty("id");
  });

  test("falla con canal invalido", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "sms", payload: {} });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("channel requerido");
  });

  test("falla con payload array porque no es objeto valido", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("payload debe ser un objeto");
  });

  test("rechaza async cuando no es booleano", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "123", text: "test" }, async: "false" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("async debe ser booleano");
  });
});

describe("POST /notify (sync)", () => {
  test("envio sincronico llama al handler directamente", async () => {
    const res = await request(app)
      .post("/notify")
      .send({
        channel: "telegram",
        payload: { chat_id: "123", text: "sync test" },
        async: false
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("sent");
    expect(sendTelegram).toHaveBeenCalledWith({ chat_id: "123", text: "sync test" });
  });

  test("propaga mensaje util cuando falla el handler", async () => {
    sendTelegram.mockRejectedValueOnce(new Error("Bot token invalido"));

    const res = await request(app)
      .post("/notify")
      .send({
        channel: "telegram",
        payload: { chat_id: "123", text: "error test" },
        async: false
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Bot token invalido");
  });
});

describe("GET /notify/:id", () => {
  test("retorna estado de notificacion encolada", async () => {
    const enqueue = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "123", text: "status test" } });
    const id = enqueue.body.data.id;

    const res = await request(app).get(`/notify/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.channel).toBe("telegram");
  });

  test("retorna 404 para ID inexistente", async () => {
    const res = await request(app).get("/notify/id-que-no-existe");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /notifications", () => {
  test("lista notificaciones con metadata de paginacion", async () => {
    await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "1", text: "uno" } });
    await request(app)
      .post("/notify")
      .send({ channel: "email", payload: { to: "a@b.com", subject: "s", text: "t" } });

    const res = await request(app).get("/notifications?limit=1&offset=1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ limit: 1, offset: 1 });
  });

  test("rechaza limit fuera de rango", async () => {
    const res = await request(app).get("/notifications?limit=200");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("limit");
  });

  test("rechaza offset negativo", async () => {
    const res = await request(app).get("/notifications?offset=-1");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("offset");
  });

  test("rechaza status invalido", async () => {
    const res = await request(app).get("/notifications?status=done");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("status invalido");
  });

  test("rechaza channel invalido como filtro", async () => {
    const res = await request(app).get("/notifications?channel=sms");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("channel invalido");
  });
});

describe("GET /stats", () => {
  test("retorna estadisticas envueltas en respuesta uniforme", async () => {
    const res = await request(app).get("/stats");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("pending");
    expect(res.body.data).toHaveProperty("retryScheduled");
  });
});

describe("POST /notify/bulk", () => {
  test("encola multiples notificaciones y reporta errores por item", async () => {
    const res = await request(app)
      .post("/notify/bulk")
      .send({
        notifications: [
          { channel: "telegram", payload: { chat_id: "1", text: "bulk1" } },
          { channel: "sms", payload: { to: "123" } },
          { channel: "email", payload: { to: "x@y.com", subject: "s", text: "t" } }
        ]
      });

    expect(res.status).toBe(202);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.results[1]).toEqual({
      success: false,
      error: "canal invalido o payload faltante"
    });
  });

  test("falla con array vacio", async () => {
    const res = await request(app)
      .post("/notify/bulk")
      .send({ notifications: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("NotificationQueue", () => {
  test("encola y procesa una notificacion", async () => {
    const q = new NotificationQueue(":memory:");
    const mockHandler = jest.fn().mockResolvedValue("ok");
    q.registerHandler("test", mockHandler);

    const id = q.enqueue("test", { data: "test" });
    await q.tick();

    const status = q.getStatus(id);
    expect(status.status).toBe("sent");
    expect(mockHandler).toHaveBeenCalledWith({ data: "test" });
    q.close();
  });

  test("programa reintento con backoff en caso de fallo", async () => {
    const q = new NotificationQueue({ dbPath: ":memory:", baseRetryDelayMs: 50, maxRetries: 3 });
    q.registerHandler("test", jest.fn().mockRejectedValue(new Error("fallo de prueba")));

    const id = q.enqueue("test", { data: "fail" });
    await q.tick();

    const status = q.getStatus(id);
    expect(status.status).toBe("pending");
    expect(status.attempts).toBe(1);
    expect(status.next_attempt_at).toBeGreaterThan(Date.now() - 1);
    expect(q.stats().retryScheduled).toBe(1);
    q.close();
  });

  test("respeta maxRetries configurado por instancia", async () => {
    const q = new NotificationQueue({ dbPath: ":memory:", maxRetries: 2 });
    q.registerHandler("test", jest.fn().mockRejectedValue(new Error("siempre falla")));

    const id = q.enqueue("test", { data: "fail" });
    await q.tick();
    q.db.prepare("UPDATE notifications SET next_attempt_at = 0 WHERE id = ?").run(id);
    await q.tick();

    const status = q.getStatus(id);
    expect(status.status).toBe("failed");
    expect(status.max_retries).toBe(2);
    q.close();
  });
});

describe("404", () => {
  test("ruta desconocida retorna respuesta uniforme", async () => {
    const res = await request(app).get("/ruta-no-existe");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Ruta no encontrada");
  });

  test("json malformado retorna 400 uniforme", async () => {
    const res = await request(app)
      .post("/notify")
      .set("Content-Type", "application/json")
      .send('{"channel":"telegram",');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("JSON malformado");
    expect(res.body.error).toBe("INVALID_JSON");
  });
});
