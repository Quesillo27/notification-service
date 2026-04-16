"use strict";
/**
 * Cola de notificaciones en memoria con persistencia SQLite.
 * Soporta reintentos con backoff exponencial.
 */
const Database = require("better-sqlite3");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DB_PATH = process.env.QUEUE_DB_PATH || path.join(process.cwd(), "queue.db");

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3");
const BASE_RETRY_DELAY_MS = parseInt(process.env.BASE_RETRY_DELAY_MS || "1000");
const WORKER_INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || "5000");

class NotificationQueue {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
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
        max_retries INTEGER NOT NULL DEFAULT ${MAX_RETRIES},
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

  /**
   * Registra un handler para un canal.
   * @param {string} channel - Nombre del canal (email, telegram, webhook)
   * @param {Function} handler - async (payload) => void
   */
  registerHandler(channel, handler) {
    this.handlers[channel] = handler;
  }

  /**
   * Encola una notificación.
   * @param {string} channel
   * @param {object} payload
   * @returns {string} ID de la notificación
   */
  enqueue(channel, payload) {
    const id = uuidv4();
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO notifications (id, channel, payload, status, attempts, max_retries, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 0, ?, 0, ?, ?)
    `);
    stmt.run(id, channel, JSON.stringify(payload), MAX_RETRIES, now, now);
    return id;
  }

  /**
   * Obtiene el estado de una notificación por ID.
   */
  getStatus(id) {
    const row = this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload),
    };
  }

  /**
   * Lista notificaciones con filtros opcionales.
   */
  list({ status, channel, limit = 50 } = {}) {
    let query = "SELECT * FROM notifications WHERE 1=1";
    const params = [];
    if (status) { query += " AND status = ?"; params.push(status); }
    if (channel) { query += " AND channel = ?"; params.push(channel); }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(query).all(...params);
    return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  /**
   * Estadísticas de la cola.
   */
  stats() {
    const rows = this.db.prepare(
      "SELECT status, COUNT(*) as count FROM notifications GROUP BY status"
    ).all();
    const result = { pending: 0, processing: 0, sent: 0, failed: 0, total: 0 };
    for (const row of rows) {
      result[row.status] = row.count;
      result.total += row.count;
    }
    return result;
  }

  /**
   * Procesa una notificación pendiente.
   */
  async _processOne(row) {
    const handler = this.handlers[row.channel];
    if (!handler) {
      this._markFailed(row.id, `No hay handler para canal: ${row.channel}`);
      return;
    }

    // Marcar como procesando
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
        // Backoff exponencial: 1s, 2s, 4s, 8s...
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempts - 1);
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

  /**
   * Worker: procesa notificaciones pendientes listas para ejecutarse.
   */
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

  /**
   * Inicia el worker en background.
   */
  startWorker() {
    if (this._workerTimer) return;
    this._workerTimer = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        console.error("[queue] Error en worker:", err);
      }
    }, WORKER_INTERVAL_MS);
    // Ejecutar inmediatamente también
    this.tick().catch(console.error);
  }

  /**
   * Detiene el worker.
   */
  stopWorker() {
    if (this._workerTimer) {
      clearInterval(this._workerTimer);
      this._workerTimer = null;
    }
  }

  /**
   * Cierra la conexión a la BD.
   */
  close() {
    this.stopWorker();
    this.db.close();
  }
}

module.exports = { NotificationQueue };
