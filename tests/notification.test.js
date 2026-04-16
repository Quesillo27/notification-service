"use strict";
const request = require("supertest");
const { createApp } = require("../src/app");
const { NotificationQueue } = require("../src/queue/queue");

// Mock de channels para no hacer llamadas reales
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
const { sendEmail } = require("../src/channels/email");
const { sendWebhook } = require("../src/channels/webhook");

let app, queue;

beforeEach(() => {
  jest.clearAllMocks();
  // Base de datos en memoria para cada test
  const result = createApp({ dbPath: ":memory:" });
  app = result.app;
  queue = result.queue;
});

afterEach(() => {
  queue.close();
});

describe("GET /health", () => {
  test("retorna status ok con canales", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.channels).toContain("telegram");
    expect(res.body.channels).toContain("email");
    expect(res.body.channels).toContain("webhook");
    expect(res.body.queue).toHaveProperty("total");
  });
});

describe("POST /notify (async)", () => {
  test("encola notificación Telegram", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "123", text: "test" } });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    expect(res.body).toHaveProperty("id");
  });

  test("encola notificación email", async () => {
    const res = await request(app)
      .post("/notify")
      .send({
        channel: "email",
        payload: { to: "user@example.com", subject: "Test", text: "Hola" }
      });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
  });

  test("encola notificación webhook", async () => {
    const res = await request(app)
      .post("/notify")
      .send({
        channel: "webhook",
        payload: { url: "https://example.com/hook", body: { event: "test" } }
      });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
  });

  test("falla con canal inválido", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "sms", payload: {} });
    expect(res.status).toBe(400);
  });

  test("falla sin payload", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram" });
    expect(res.status).toBe(400);
  });

  test("falla sin channel", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ payload: { text: "test" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /notify (sync)", () => {
  test("envío síncrono llama al handler directamente", async () => {
    const res = await request(app)
      .post("/notify")
      .send({
        channel: "telegram",
        payload: { chat_id: "123", text: "sync test" },
        async: false
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(sendTelegram).toHaveBeenCalledWith({ chat_id: "123", text: "sync test" });
  });

  test("maneja error del handler síncrono", async () => {
    sendTelegram.mockRejectedValueOnce(new Error("Bot token inválido"));
    const res = await request(app)
      .post("/notify")
      .send({
        channel: "telegram",
        payload: { chat_id: "123", text: "error test" },
        async: false
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Bot token inválido");
  });
});

describe("GET /notify/:id", () => {
  test("retorna estado de notificación encolada", async () => {
    const enqueue = await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "123", text: "status test" } });
    const id = enqueue.body.id;

    const res = await request(app).get(`/notify/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.channel).toBe("telegram");
    expect(["pending", "sent", "processing"]).toContain(res.body.status);
  });

  test("retorna 404 para ID inexistente", async () => {
    const res = await request(app).get("/notify/id-que-no-existe");
    expect(res.status).toBe(404);
  });
});

describe("GET /notifications", () => {
  test("lista notificaciones", async () => {
    await request(app)
      .post("/notify")
      .send({ channel: "telegram", payload: { chat_id: "1", text: "uno" } });
    await request(app)
      .post("/notify")
      .send({ channel: "email", payload: { to: "a@b.com", subject: "s", text: "t" } });

    const res = await request(app).get("/notifications");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  test("filtra por canal", async () => {
    const res = await request(app).get("/notifications?channel=telegram");
    expect(res.status).toBe(200);
    for (const n of res.body.notifications) {
      expect(n.channel).toBe("telegram");
    }
  });
});

describe("GET /stats", () => {
  test("retorna estadísticas de la cola", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pending");
    expect(res.body).toHaveProperty("sent");
    expect(res.body).toHaveProperty("failed");
    expect(res.body).toHaveProperty("total");
  });
});

describe("POST /notify/bulk", () => {
  test("encola múltiples notificaciones", async () => {
    const res = await request(app)
      .post("/notify/bulk")
      .send({
        notifications: [
          { channel: "telegram", payload: { chat_id: "1", text: "bulk1" } },
          { channel: "email", payload: { to: "x@y.com", subject: "s", text: "t" } },
          { channel: "webhook", payload: { url: "https://x.com", body: {} } }
        ]
      });
    expect(res.status).toBe(202);
    expect(res.body.total).toBe(3);
    expect(res.body.results).toHaveLength(3);
  });

  test("falla con array vacío", async () => {
    const res = await request(app)
      .post("/notify/bulk")
      .send({ notifications: [] });
    expect(res.status).toBe(400);
  });

  test("falla sin notifications", async () => {
    const res = await request(app)
      .post("/notify/bulk")
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("NotificationQueue", () => {
  test("encola y procesa una notificación", async () => {
    const q = new NotificationQueue(":memory:");
    const mockHandler = jest.fn().mockResolvedValue("ok");
    q.registerHandler("test", mockHandler);

    const id = q.enqueue("test", { data: "test" });
    expect(id).toBeTruthy();

    await q.tick();

    const status = q.getStatus(id);
    expect(status.status).toBe("sent");
    expect(mockHandler).toHaveBeenCalledWith({ data: "test" });
    q.close();
  });

  test("reintenta con backoff en caso de fallo", async () => {
    const q = new NotificationQueue(":memory:");
    let callCount = 0;
    const mockHandler = jest.fn().mockImplementation(async () => {
      callCount++;
      throw new Error("fallo de prueba");
    });
    q.registerHandler("test", mockHandler);

    const id = q.enqueue("test", { data: "fail" });
    await q.tick(); // intento 1
    const s1 = q.getStatus(id);
    expect(s1.status).toBe("pending"); // reintentar
    expect(s1.attempts).toBe(1);
    q.close();
  });

  test("marca como failed después de max_retries", async () => {
    process.env.MAX_RETRIES = "2";
    const q = new NotificationQueue(":memory:");
    const mockHandler = jest.fn().mockRejectedValue(new Error("siempre falla"));
    q.registerHandler("test", mockHandler);

    const id = q.enqueue("test", { data: "fail" });

    // Simular múltiples intentos forzando next_attempt_at = 0
    for (let i = 0; i < 3; i++) {
      q.db.prepare("UPDATE notifications SET next_attempt_at = 0 WHERE id = ?").run(id);
      await q.tick();
    }

    const status = q.getStatus(id);
    expect(status.status).toBe("failed");
    q.close();
    delete process.env.MAX_RETRIES;
  });

  test("stats retorna conteos correctos", async () => {
    const q = new NotificationQueue(":memory:");
    q.registerHandler("test", jest.fn().mockResolvedValue("ok"));

    q.enqueue("test", {});
    q.enqueue("test", {});

    const stats = q.stats();
    expect(stats.pending).toBe(2);
    expect(stats.total).toBe(2);
    q.close();
  });
});

describe("404", () => {
  test("ruta desconocida retorna 404", async () => {
    const res = await request(app).get("/ruta-no-existe");
    expect(res.status).toBe(404);
  });
});
