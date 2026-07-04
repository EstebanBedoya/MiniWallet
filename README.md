# MiniWallet

Servicio de transferencias de saldo entre usuarios, con ledger de doble entrada, holds de compliance y auditoría.

> Estado: **funcionalidad completa (Slices 0–5)** — auth (JWT), ledger de doble entrada + seed, transferencia < $1000 con idempotencia, hold de compliance ≥ $1000 (aprobar/rechazar admin) + auditoría, historial paginado y detección de transacciones sospechosas. Todos los RF del enunciado cubiertos. Ver el flujo en `docs/BUILD_CONVENTIONS.md`.

## Stack

Backend: NestJS (Node 22 + TypeScript) · PostgreSQL 16 · TypeORM · JWT · pnpm · Jest.
Frontend: Next.js 16 (App Router) · shadcn/ui · Tailwind v4.
Orquestación: Docker Compose (`db` + `api` + `web`).
Justificación en `docs/DIAGRAMS/containers.md` y `DECISIONS.md`.

## Cómo ejecutar

Requisitos: Docker + Docker Compose.

```bash
docker compose up --build
```

Levanta `api` (NestJS) + `db` (PostgreSQL) + `web` (frontend Next.js). La API espera a que la DB esté healthy antes de arrancar; el `web` espera a la API.

Verificar que está arriba:

```bash
curl http://localhost:3000/health
# { "status": "ok", "info": { "database": { "status": "up" } }, ... }
```

## Frontend

Interfaz web mobile-first en **Next.js 16 + shadcn/ui** (carpeta `frontend/`). Con `docker
compose up` queda disponible en:

```
http://localhost:3001
```

Consume **todos** los endpoints de la API respetando la lógica de dominio (holds ≥ $1000,
idempotencia, códigos de error semánticos, gating de admin por rol). No habla con la API por
CORS: usa un proxy same-origin (`/api/*` → `api:3000`) vía `rewrites` de Next (ADR-018), así
que el backend no se toca. Detalle en `docs/features/frontend.md`.

Flujo de demo:
1. Registrate en `/register` → ves tu saldo semilla ($5.000).
2. Enviá $250 a otro usuario → se liquida al instante (SETTLED).
3. Enviá $1.500 → aviso de compliance, queda "En revisión" (el saldo se descuenta ya).
4. Entrá como admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD` del compose) → panel de compliance →
   aprobás el hold y recién ahí se acredita al receptor.

Desarrollo local del front (sin Docker, con la API en `localhost:3000`):

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000 -> conflictúa con la API;
# usá otro puerto: PORT=3001 npm run dev, con API_INTERNAL_URL=http://localhost:3000
```

### Desarrollo local (sin Docker para la API)

```bash
corepack enable
pnpm install
pnpm start:dev   # requiere una PostgreSQL accesible según .env
```

Copiar `.env.example` a `.env` y ajustar. Migraciones: `pnpm migration:run`.

## Tests

```bash
pnpm test        # unitarios (no requieren base de datos)
pnpm test:e2e    # integración — REQUIERE la base de datos corriendo
pnpm lint        # ESLint + Prettier
```

> **Importante para el test de integración:** `pnpm test:e2e` levanta la app y se
> conecta a PostgreSQL en `localhost:5432`. Antes de correrlo, tené la base
> arriba con `docker compose up -d db` (o `docker compose up`). El test cubre el
> flujo completo de transferencia: settlement < $1000, idempotencia, hold de
> compliance ≥ $1000 (aprobar/rechazar), historial y detección de sospechosas,
> y valida los invariantes contables al final.

Validador de invariantes contables (SQL, sobre la base en Docker):

```bash
docker compose exec -T db psql -U miniwallet -d miniwallet -t < scripts/validate_ledger_invariants.sql
```

## Documentación

| Doc | Contenido |
|---|---|
| `docs/CONTEXT.md` | Actores, alcance, supuestos |
| `docs/DOMAIN_SPEC.md` | Modelo de dominio, estados, invariantes, idempotencia |
| `docs/DATA_MODEL.md` | Esquema PostgreSQL (ledger de doble entrada) |
| `docs/DIAGRAMS/` | Diagramas C4 (contexto, contenedores, componentes, deployment, flujo) |
| `docs/TEST_PLAN.md` | Casos de prueba |
| `docs/RISKS_AND_SCALABILITY.md` | Riesgos y plan de escalabilidad |
| `DECISIONS.md` | ADRs |

## Limitaciones conocidas

- Sin dinero real ni rails de pago: el saldo es interno (semilla inicial). Ver `docs/CONTEXT.md`.
- Validación de compliance **manual** (no motor AML real). "Sospechosas" son heurísticas explicables, no ML. El criterio C4 (vaciado de cuenta) está diferido (requiere snapshot de saldo, ADR-005), y el criterio de velocity marca desde la N-ésima transferencia de la ráfaga en adelante.
- JWT sin refresh token ni revocación en esta versión.
- Seguridad básica presente (rate limiting global vía `@nestjs/throttler` + `helmet`); un endurecimiento por-endpoint (límites más estrictos en login/transferencias) queda como mejora futura.
- Sin multi-moneda (todo USD). Un solo nodo de API + una DB.
- Detalle completo en `docs/RISKS_AND_SCALABILITY.md` §1.

## Cómo escalaría esto

Resumen (detalle en `docs/RISKS_AND_SCALABILITY.md` §2): API stateless replicable tras balanceador → réplicas de lectura para historial y sospechosas → particionamiento de saldo para cuentas calientes → compliance asíncrono por eventos → particionar el ledger por fecha a gran volumen.
