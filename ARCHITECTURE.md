# Architecture

## Capas

- `src/app.js`: composicion HTTP, middlewares y endpoints operativos.
- `src/routes/notifications.js`: validacion ligera y traduccion HTTP.
- `src/queue/queue.js`: persistencia SQLite, retries y worker.
- `src/channels/*.js`: adaptadores por canal de entrega.
- `src/config.js`: configuracion centralizada para runtime y tests.
- `src/utils/`: respuestas comunes y validaciones de red.

## Decisiones

- SQLite mantiene la cola persistente sin depender de infraestructura externa.
- Los handlers de canal se registran en runtime para conservar extensibilidad sin acoplar la cola a Express.
- El bloqueo SSRF se aplica en el canal webhook para proteger tanto el flujo HTTP como futuros usos internos del servicio.
- La respuesta uniforme simplifica clientes, tests y observabilidad.
