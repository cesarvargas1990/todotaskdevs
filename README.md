# TodoTasks

MVP full stack para crear, asignar y seguir tareas entre usuarios. Incluye frontend React, backend NestJS, MySQL, JWT, adjuntos locales, correos SMTP configurables, Swagger y Nginx preparado para publicar la app en `/todotaskdev`.

## Ejecución con Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

Abrir:

- App: `http://localhost:8080/todotaskdev/`
- Swagger: `http://localhost:8080/todotaskdev/docs`

Para producción detrás del dominio solicitado, publica el servicio Nginx y enruta `https://cesarvargas.tech/todotaskdev` hacia este contenedor. La configuración ya usa el prefijo `/todotaskdev` y proxifica la API en `/todotaskdev/api`.

## Variables principales

Revisar `.env.example`. Cambia `JWT_SECRET` y completa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` si quieres envío real de correos. Si SMTP no está configurado, los eventos se registran en logs y no bloquean la operación.

## Endpoints

- `POST /auth/login`
- `GET /auth/me`
- `GET /users`
- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks`
- `PATCH /tasks/:id`
- `PATCH /tasks/:id/status`
- `GET /tasks/:id/comments`
- `POST /tasks/:id/comments`
- `POST /tasks/:id/attachments`
- `GET /attachments/:id/download`
- `DELETE /attachments/:id`

Todos los endpoints funcionales, salvo login y Swagger, requieren token JWT.
