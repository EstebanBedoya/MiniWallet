# MiniWallet

Servicio de transferencias de saldo entre usuarios, con ledger de doble entrada, holds de compliance y auditoría.

> Estado: **funcionalidad completa (Slices 0–5)** — auth (JWT), ledger de doble entrada + seed, transferencia < $1000 con idempotencia, hold de compliance ≥ $1000 (aprobar/rechazar admin) + auditoría, historial paginado y detección de transacciones sospechosas. Todos los RF del enunciado cubiertos. Ver el flujo en `docs/BUILD_CONVENTIONS.md`.

## Stack

NestJS (Node 22 + TypeScript) · PostgreSQL 16 · TypeORM · JWT · Docker Compose · pnpm · Jest.
Justificación en `docs/DIAGRAMS/containers.md` y `DECISIONS.md`.

## Cómo ejecutar

Requisitos: Docker + Docker Compose.

```bash
docker compose up --build
```

Levanta `api` (NestJS) + `db` (PostgreSQL). La API espera a que la DB esté healthy antes de arrancar.

Verificar que está arriba:

```bash
curl http://localhost:3000/health
# { "status": "ok", "info": { "database": { "status": "up" } }, ... }
```

### Desarrollo local (sin Docker para la API)

```bash
corepack enable
pnpm install
pnpm start:dev   # requiere una PostgreSQL accesible según .env
```

Copiar `.env.example` a `.env` y ajustar. Migraciones: `pnpm migration:run`.

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
- Sin multi-moneda (todo USD). Un solo nodo de API + una DB.
- Detalle completo en `docs/RISKS_AND_SCALABILITY.md` §1.

## Cómo escalaría esto

Resumen (detalle en `docs/RISKS_AND_SCALABILITY.md` §2): API stateless replicable tras balanceador → réplicas de lectura para historial y sospechosas → particionamiento de saldo para cuentas calientes → compliance asíncrono por eventos → particionar el ledger por fecha a gran volumen.
