# notification-service

![CI](https://github.com/Quesillo27/notification-service/actions/workflows/ci.yml/badge.svg)
![Node.js](https://img.shields.io/badge/node-20+-green)
![Licencia](https://img.shields.io/badge/licencia-MIT-green)

Servicio unificado de notificaciones con cola SQLite persistente para Telegram, Email SMTP y Webhooks. Expone una API REST con retries exponenciales, respuestas uniformes, paginacion y endurecimiento HTTP para uso real en produccion.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/notification-service
cd notification-service
./setup.sh
```

## Uso rapido

```bash
npm start
```

## Ejemplos reales

```bash
# Encolar una notificacion Telegram
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"channel":"telegram","payload":{"chat_id":"123456","text":"Hola"}}'

# Respuesta esperada
# {"success":true,"message":"Notificacion encolada","data":{"id":"...","status":"queued","channel":"telegram"},"error":null}

# Envio sincronico a webhook
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"channel":"webhook","async":false,"payload":{"url":"https://example.com/hook","body":{"event":"payment.created"}}}'

# Listado paginado
curl "http://localhost:3000/notifications?channel=telegram&limit=10&offset=0"

# Salud y metricas
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

## Variables de entorno

| Variable | Descripcion | Default | Obligatoria |
|---|---|---|---|
| `PORT` | Puerto HTTP del servicio | `3000` | No |
| `RATE_LIMIT_MAX` | Maximo de requests por ventana | `100` | No |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate limit en ms | `60000` | No |
| `CORS_ALLOWED_ORIGINS` | Lista CSV de origins permitidos | vacio | No |
| `ALLOW_PRIVATE_WEBHOOK_HOSTS` | Permite webhooks a hosts privados/locales | `false` | No |
| `QUEUE_DB_PATH` | Ruta SQLite de la cola | `./queue.db` | No |
| `MAX_RETRIES` | Reintentos maximos por notificacion | `3` | No |
| `BASE_RETRY_DELAY_MS` | Delay base del backoff exponencial | `1000` | No |
| `WORKER_INTERVAL_MS` | Frecuencia del worker en ms | `5000` | No |
| `TELEGRAM_BOT_TOKEN` | Token Bot API para Telegram | - | Solo si usas Telegram |
| `SMTP_HOST` | Host SMTP | - | Solo si usas Email |
| `SMTP_PORT` | Puerto SMTP | `587` | No |
| `SMTP_USER` | Usuario SMTP | - | No |
| `SMTP_PASS` | Password SMTP | - | No |
| `SMTP_FROM` | Remitente por defecto | `notificaciones@<SMTP_HOST>` | No |

## API

### `GET /health`
- Estado del servicio, version, uptime y resumen de cola.

### `GET /metrics`
- Uptime, uso de memoria y metricas de cola.

### `POST /notify`
- Encola o envia una notificacion.
- Body:

```json
{
  "channel": "telegram",
  "async": true,
  "payload": {
    "chat_id": "123456",
    "text": "Hola"
  }
}
```

### `POST /notify/bulk`
- Encola hasta 100 notificaciones y reporta errores por item.

### `GET /notify/:id`
- Consulta el estado de una notificacion.

### `GET /notifications`
- Filtros: `status`, `channel`, `limit`, `offset`.

### `GET /stats`
- Conteos agregados de la cola, incluyendo `retryScheduled`.

## Docker

```bash
docker build -t notification-service .
docker run --rm -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN=xxx \
  -e SMTP_HOST=smtp.example.com \
  -v $(pwd)/data:/app/data \
  notification-service
```

## Comandos utiles

```bash
make test
make docker
make dev
```

## Roadmap

- Persistencia de metricas historicas para latencia y throughput.
- Workers paralelos coordinados para mayor volumen de entrega.
- Autenticacion por API key para exponer el servicio de forma publica.
