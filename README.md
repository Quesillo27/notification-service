# notification-service

![Node.js](https://img.shields.io/badge/node-20+-green) ![Express](https://img.shields.io/badge/express-4.x-blue) ![SQLite](https://img.shields.io/badge/sqlite-cola-blue) ![Licencia](https://img.shields.io/badge/licencia-MIT-green)

Servicio unificado de notificaciones que soporta Telegram, Email (SMTP) y Webhooks con cola persistente SQLite, reintentos con backoff exponencial y envío bulk.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/notification-service
cd notification-service
npm install
```

## Uso

```bash
cp .env.example .env
# Configurar TELEGRAM_BOT_TOKEN y/o SMTP_HOST
npm start
```

## Ejemplo

```bash
# Enviar notificacion Telegram (asíncrono)
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"channel":"telegram","payload":{"chat_id":"123456","text":"Hola!"}}'
# → {"id":"abc-uuid","status":"queued","channel":"telegram"}

# Verificar estado
curl http://localhost:3000/notify/abc-uuid
# → {"id":"abc-uuid","status":"sent",...}

# Envío síncrono (espera respuesta del canal)
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"channel":"telegram","payload":{...},"async":false}'

# Estadísticas de la cola
curl http://localhost:3000/stats
# → {"pending":0,"processing":0,"sent":5,"failed":0,"total":5}
```

## API / Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/health` | Health check con stats de la cola |
| POST | `/notify` | Enviar notificacion (async=true por defecto) |
| POST | `/notify/bulk` | Enviar hasta 100 notificaciones en batch |
| GET | `/notify/:id` | Estado de una notificacion |
| GET | `/notifications` | Listar notificaciones (filtros: status, channel) |
| GET | `/stats` | Estadisticas de la cola |

## Canales

### Telegram
```json
{ "channel": "telegram", "payload": { "chat_id": "123456", "text": "Mensaje" } }
```

### Email
```json
{ "channel": "email", "payload": { "to": "user@example.com", "subject": "Asunto", "text": "Cuerpo", "html": "<b>Opcional</b>" } }
```

### Webhook
```json
{ "channel": "webhook", "payload": { "url": "https://example.com/hook", "body": { "event": "test" } } }
```

## Cola

- Persistencia: SQLite (configurable via `QUEUE_DB_PATH`)
- Reintentos: backoff exponencial (1s, 2s, 4s...) hasta `MAX_RETRIES` intentos
- Worker: corre cada `WORKER_INTERVAL_MS` ms procesando notificaciones pendientes

## Variables de entorno

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | 3000 | Puerto del servidor |
| `TELEGRAM_BOT_TOKEN` | — | Token para canal Telegram |
| `SMTP_HOST` | — | Host SMTP para canal email |
| `SMTP_PORT` | 587 | Puerto SMTP |
| `SMTP_USER` | — | Usuario SMTP |
| `SMTP_PASS` | — | Password SMTP |
| `QUEUE_DB_PATH` | ./queue.db | Ruta base de datos SQLite de la cola |
| `MAX_RETRIES` | 3 | Intentos maximos por notificacion |
| `BASE_RETRY_DELAY_MS` | 1000 | Delay base para backoff exponencial |
| `WORKER_INTERVAL_MS` | 5000 | Intervalo del worker en ms |

## Deploy con Docker

```bash
docker build -t notification-service .
docker run -d -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN=xxx \
  -e SMTP_HOST=smtp.gmail.com \
  -v $(pwd)/data:/app/data \
  notification-service
```

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar.
