"use strict";

jest.mock("node-fetch", () => jest.fn());

const fetch = require("node-fetch");
const { sendWebhook } = require("../src/channels/webhook");

describe("sendWebhook", () => {
  beforeEach(() => {
    fetch.mockReset();
    delete process.env.ALLOW_PRIVATE_WEBHOOK_HOSTS;
  });

  test("bloquea destinos localhost para evitar SSRF", async () => {
    await expect(
      sendWebhook({ url: "http://127.0.0.1:3000/internal", body: { ok: true } })
    ).rejects.toThrow("no se permiten destinos locales o privados");
  });

  test("bloquea protocolos no http/https", async () => {
    await expect(
      sendWebhook({ url: "file:///etc/passwd", body: {} })
    ).rejects.toThrow("solo se permiten URLs http o https");
  });

  test("omite body cuando el metodo es GET", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true }),
      text: jest.fn()
    });

    const result = await sendWebhook({ url: "https://example.com/hook", method: "get", body: { ping: true } });

    expect(fetch).toHaveBeenCalledWith("https://example.com/hook", expect.objectContaining({
      method: "GET",
      body: undefined
    }));
    expect(result.status).toBe(200);
  });
});
