"use strict";
/**
 * Cola de notificaciones en memoria con persistencia SQLite.
 * Soporta reintentos con backoff exponencial.
 */
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const { getConfig } = require("../config");
const { logger } = require("../logger");

class NotificationQueue {
  constructor(options = {}) {
    const config = typeof options === "string" ? getConfig({ dbPath: options }) : getConfig(options);
    this.config = config;
    this.db = new Database(config.queueDbPath);
    this.handlers = {};
    this._workerTimer = null;
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT ${this.config.maxRetries},
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, next_attempt_at)
    `);
  }

  registerHandler(channel, handler) {
    this.handlers[channel] = handler;
  }

  enqueue(channel, payload) {
    const id = uuidv4();
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO notifications (id, channel, payload, status, attempts, max_retries, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 0, ?, 0, ?, ?)
    `);
    stmt.run(id, channel, JSON.stringify(payload), this.config.maxRetries, now, now);
    return id;
  }

  getStatus(id) {
    const row = this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload),
    };
  }

  list({ status, channel, limit = 50, offset = 0 } = {}) {
    let query = "SELECT * FROM notifications WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (channel) {
      query += " AND channel = ?";
      params.push(channel);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params);
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  }

  stats() {
    const rows = this.db.prepare(
      "SELECT status, COUNT(*) as count FROM notifications GROUP BY status"
    ).all();
    const retryScheduled = this.db.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE attempts > 0 AND status = 'pending'"
    ).get().count;

    const result = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      retryScheduled,
      total: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
      result.total += row.count;
    }

    return result;
  }

  async _processOne(row) {
    const handler = this.handlers[row.channel];
    if (!handler) {
      this._markFailed(row.id, `No hay handler para canal: ${row.channel}`);
      return;
    }

    this.db.prepare("UPDATE notifications SET status = 'processing', updated_at = ? WHERE id = ?")
      .run(Date.now(), row.id);

    try {
      await handler(JSON.parse(row.payload));
      this.db.prepare("UPDATE notifications SET status = 'sent', updated_at = ? WHERE id = ?")
        .run(Date.now(), row.id);
    } catch (err) {
      const attempts = row.attempts + 1;
      if (attempts >= row.max_retries) {
        this._markFailed(row.id, err.message);
      } else {
        const delay = this.config.baseRetryDelayMs * Math.pow(2, attempts - 1);
        this.db.prepare(`
          UPDATE notifications
          SET status = 'pending', attempts = ?, next_attempt_at = ?, error = ?, updated_at = ?
          WHERE id = ?
        `).run(attempts, Date.now() + delay, err.message, Date.now(), row.id);
      }
    }
  }

  _markFailed(id, error) {
    this.db.prepare(
      "UPDATE notifications SET status = 'failed', error = ?, updated_at = ? WHERE id = ?"
    ).run(error, Date.now(), id);
  }

  async tick() {
    const now = Date.now();
    const pending = this.db.prepare(`
      SELECT * FROM notifications
      WHERE status = 'pending' AND next_attempt_at <= ?
      ORDER BY created_at ASC
      LIMIT 10
    `).all(now);

    for (const row of pending) {
      await this._processOne(row);
    }
  }

  startWorker() {
    if (this._workerTimer) return;
    this._workerTimer = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error("queue worker failed", { error: err.message });
      }
    }, this.config.workerIntervalMs);

    this.tick().catch((err) => {
      logger.error("queue initial tick failed", { error: err.message });
    });
  }

  stopWorker() {
    if (this._workerTimer) {
      clearInterval(this._workerTimer);
      this._workerTimer = null;
    }
  }

  close() {
    this.stopWorker();
    this.db.close();
  }
}

module.exports = { NotificationQueue };
