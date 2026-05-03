# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2026-05-03

### Fixed
- `POST /notify` ahora responde `400` uniforme cuando recibe JSON malformado en lugar de escalar a `500`.
- `POST /notify` valida `async` como booleano para evitar envios asincronos accidentales por coercion de tipos.
- `GET /notifications` valida filtros `status` y `channel` antes de consultar la cola.

## [1.1.0] - 2026-04-24

### Added
- Endurecimiento HTTP con `helmet`, rate limiting y CORS con allowlist por entorno.
- Endpoint `GET /metrics` y respuestas API uniformes con `{ success, data, error, message }`.
- Bloqueo SSRF para webhooks locales o privados y soporte de paginacion `limit`/`offset` en listados.
- CI con GitHub Actions, Docker multi-stage y licencia MIT.

### Changed
- Logger estructurado JSON para arranque, errores y worker.
- Configuracion centralizada para cola, puertos y politicas HTTP.

### Fixed
- `MAX_RETRIES`, `BASE_RETRY_DELAY_MS` y `WORKER_INTERVAL_MS` ahora se respetan por instancia y por entorno.
