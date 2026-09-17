# EduArchive SGDEA

Sistema de Gestión Documental Electrónico de Archivo de la **Corporación Cultural
Colegio Alemán de Barranquilla**.

- **Cliente**: React 19 + Vite + TypeScript estricto + Tailwind compilado (`src/`).
- **Servidor**: Node 24 + Express + PostgreSQL 17 (`server/`).

El navegador nunca ve credenciales: todo el acceso a almacenamiento, IA y base de
datos ocurre en la API.

## Requisitos

- Node.js 24 y npm 11
- PostgreSQL 17 en local (ver `server/README.md`)

## Puesta en marcha

```bash
npm install                 # dependencias del cliente
npm --prefix server install # dependencias de la API

cp .env.example .env.local  # VITE_API_URL
# configura server/.env siguiendo server/README.md

npm --prefix server run db:migrate
npm --prefix server run db:seed

npm run dev                 # levanta cliente (:3000) y API (:4000) a la vez
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Cliente y API en paralelo (`concurrently`). |
| `npm run dev:web` | Solo el cliente (Vite, puerto 3000, proxy `/api` → `:4000`). |
| `npm run build` | Compila el cliente a `dist/`. |
| `npm run preview` | Sirve el `dist/` compilado. |
| `npm run typecheck` | `tsc --noEmit` en modo estricto. |
| `npm test` | Pruebas del cliente (vitest + Testing Library). |
| `npm run test:server` | Pruebas de la API. |
| `npm run build:server` | Compila la API. |
| `npm run icons` | Regenera `public/icon-192.png` y `public/icon-512.png`. |

## Estructura del cliente

```
src/
  api/          capa de datos (fetch + refresh automático, un módulo por dominio)
  contexts/     Auth, Catalog, Theme, Dialog
  hooks/        useQuery, useMutation, useNotificationsStream, usePagination…
  components/   ui/ (primitivas) y layout/ (AppShell, Sidebar, Topbar…)
  features/     una carpeta por área funcional
  styles/       tokens.css (tema claro/oscuro) y globals.css
  test/         configuración de vitest
```

## Documentación

- `docs/PLAN_MAESTRO.md` — auditoría, arquitectura objetivo y plan de mejoras.
- `docs/API_CONTRACT.md` — contrato de la API.
- `docs/FRONTEND_NOTES.md` — decisiones y problemas conocidos del cliente.
- `server/CONTRACT_NOTES.md` — decisiones del servidor.
