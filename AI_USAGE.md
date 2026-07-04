# AI_USAGE — MiniWallet

Registro transparente de qué se generó con asistencia de IA (Claude), en qué parte, y **cómo se validó**. La prueba evalúa el criterio crítico sobre la salida, no el uso de IA en sí.

## Principio
Nada se aceptó sin validación. La lógica transaccional y de seguridad se revisó línea por línea y se ejecutó (tests + pruebas end-to-end reales), no solo se leyó.

---

## Fase de análisis y diseño

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| `docs/CONTEXT.md`, `DOMAIN_SPEC.md`, `DATA_MODEL.md`, diagramas C4, `TEST_PLAN.md`, `RISKS_AND_SCALABILITY.md`, `DECISIONS.md` | Redacción a partir del enunciado y del modelo de dominio fijado en `CLAUDE.md` | Revisión manual de cada supuesto contra el texto del enunciado; se verificó no inventar ni relajar requisitos; coherencia cruzada entre docs (barridos con `rg` buscando referencias contradictorias). |
| Validación contra skill `ledger-accounting-validator` | Detección de 2 errores de correctitud contable | Se confirmaron los hallazgos razonando el modelo de doble entrada: (1) el hold rompía la conservación → se agregó cuenta de sistema `COMPLIANCE_HOLD`; (2) faltaba idempotencia → se agregó. Documentado en ADR-008/009. |

---

## Slice 0 — Scaffolding

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| `package.json`, `tsconfig`, `nest-cli.json`, `Dockerfile`, `docker-compose.yml`, `src/main.ts`, `app.module.ts`, `data-source.ts`, healthcheck | Estructura base NestJS + Compose | **Ejecutado:** `pnpm install`, `pnpm build` (compila), `docker compose up --build` (levanta), `curl /health` → `status: ok` con DB conectada. |

---

## Slice 1 — Auth

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/auth.md` | Comportamiento, casos límite, errores semánticos | Revisión manual contra el modelo de dominio y los RF del enunciado. |
| `AuthService`, `UsersService`, entidad `User`, DTOs, `JwtStrategy`, guard, controller, migración `CreateUsers` | Implementación | **TDD estricto:** se escribió el test unitario primero (`auth.service.spec.ts`), se corrió en **rojo**, luego se implementó hasta **verde** (5/5). |
| Flujo end-to-end | — | **Ejecutado contra el sistema real** (docker): registro (201), duplicado case-insensitive (409), validación (400), login (token), password incorrecta (401), `/me` con y sin token (200/401). |
| Decisiones (hash, JWT) | Borrador de ADR | Revisadas y ajustadas: `bcryptjs` por compatibilidad alpine (ADR-010), `passport-jwt` idiomático (ADR-011). |

### Correcciones hechas sobre la salida de IA (no se aceptó ciego)
- Se ajustó `JWT_EXPIRES_IN` a **segundos numéricos** para evitar un casting feo por el tipo `expiresIn` de `@nestjs/jwt` (la primera versión no compilaba).
- Se corrigió un cast TS en el test (`as unknown as`) que hacía fallar la compilación antes de la aserción.
- **Review fresco:** se detectó y corrigió un **TOCTOU** en `register` (dos registros concurrentes con el mismo email) atrapando la violación `23505` de Postgres → `409`.

---

## Slice 2 — Ledger core

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/ledger.md` + refino `DATA_MODEL.md` (tabla `journals`) | Diseño de los primitivos contables | Revisión manual; se identificó que el seed no encajaba en `transaction_id` → tabla `journals` (ADR-012). |
| `money.ts`, entidades `Account`/`Journal`/`LedgerEntry`, `LedgerService`, migración `CreateLedger`, `AccountsController` | Implementación del ledger de doble entrada | **TDD:** tests de `money` (aritmética en centavos) y del guard de journal desbalanceado escritos y en verde (17/17 total). |
| Aritmética de dinero | — | **Decisión validada:** el saldo se actualiza con `balance = balance + $amount` en **SQL NUMERIC** (exacto), nunca sumando floats en JS. La comparación sum-zero usa BigInt en centavos. |
| Provisión de cuenta + seed | — | **Ejecutado contra el sistema real:** registro → `GET /accounts/me` devuelve `5000.00`; el journal `SEED` balancea. |
| **Validador de invariantes** (`scripts/validate_ledger_invariants.sql`) | Script SQL de los 3+1 invariantes | **Ejecutado (gate paso 4):** los 4 dan `PASS`. `SUM(balance)=0` con `SYSTEM_FUNDING=−10000` como contrapartida exacta del saldo de los usuarios. |

### Correcciones / decisiones de Slice 2
- Se introdujo la tabla `journals` al construir, al ver que el seed no tenía agrupador para el invariante #3 (ADR-012).
- Registro atómico (user + account + seed en una tx) (ADR-013).

---

## Slice 3 — Transferencia < $1000 + idempotencia

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/transfers.md` | Flujo, errores, idempotencia | Revisión manual contra T1/T2 y los RF del enunciado. |
| `TransfersService`, entidades `Transaction`/`IdempotencyKey`, DTO, migración `CreateTransactions`, controller | Implementación del settlement < $1000 | **TDD:** unit tests de los guards (self, monto, key faltante). 20/20 unit en verde. |
| **Test de integración obligatorio** `test/transfers.e2e-spec.ts` | Flujo end-to-end real | **Ejecutado contra la DB real:** settlement + movimiento exacto de saldo, idempotencia (sin doble gasto), self/receptor/insuficiente/≥1000, e invariantes. 4/4 verde. |
| Validador de invariantes | — | **Gate paso 4:** los 5 dan `PASS` tras toda la actividad (incluida la e2e). |

### Correcciones sobre la salida de IA (crítico — no se aceptó ciego)
- **Bug encontrado en el review/verificación:** la idempotencia con try/catch de la violación de unicidad devolvía **500**, por el aborto de transacción de Postgres (`25P02`). Se reescribió con `INSERT ... ON CONFLICT DO NOTHING` (ADR-014). Este es exactamente el tipo de error en lógica transaccional que el enunciado marca como señal negativa si se acepta sin revisión.
- Ajuste de tipos de `supertest` v7 en el test e2e.

---

## Slice 4 — Hold de compliance ≥ $1000 (tensión T1)

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/compliance-hold.md` | Camino de estado, autorización, auditoría | Revisión manual contra T1 y la máquina de estados de `DOMAIN_SPEC` §2. |
| `ComplianceService` (hold/approve/reject), `AuditService`, entidad `audit_log`, migración roles+audit, `AdminGuard`, `AdminBootstrapService`, refactor de `TransfersService` | Implementación del hold + admin | **TDD:** unit tests de los guards de transfer (constructor actualizado). 20/20 unit verde. |
| **Test de integración ampliado** | Flujo completo de hold | **Ejecutado contra la DB real:** hold (202, emisor descontado, receptor NO), approve (SETTLED, receptor acreditado recién ahí), reject (emisor reembolsado), 403 no-admin, 409 re-aprobar settled. 6/6 verde. |
| Validador + auditoría | — | **Gate paso 4:** 5 invariantes `PASS` tras mover dinero por `COMPLIANCE_HOLD`. `audit_log` con el rastro `HELD→APPROVED→SETTLED` / `HELD→REJECTED`. |

### Correcciones sobre la salida de IA (Slice 4)
- **Type quirk de TypeORM** con la columna `jsonb` de `audit_log`: se resolvió delegando `metadata` al default `'{}'` de la DB en vez de un casting.
- Separación estricta de los dos caminos de estado (settle vs. hold) en servicios distintos, según la regla no negociable del proyecto.

---

## Slice 5 — Historial + transacciones sospechosas

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/history-suspicious.md` | Historial paginado + criterios de sospechosas | Revisión manual contra RF3/RF4 y `DOMAIN_SPEC` §4. |
| `HistoryService`/controller (paginado), `SuspiciousService` (C1–C3 en SQL), endpoint admin | Implementación read-only | 20/20 unit verde. |
| **Test de integración** ampliado | Historial + sospechosas | **Ejecutado real:** historial paginado ordenado + 401 sin token; sospechosas flaggeando `STRUCTURING` (evasión) y `HIGH_AMOUNT`, 403 para no-admin. 8/8 e2e verde. |
| Umbrales de sospechosas | — | **Decisión cerrada (ADR-005):** configurables por env; C4 (vaciado) diferido con justificación (requiere snapshot de saldo). |

### Validación crítica
- El endpoint de sospechosas **solo reporta** (no cambia estado): verificado que las transacciones flaggeadas siguen en su estado y los invariantes contables siguen en `PASS` (read-only).

---

## Review holístico final (adversarial, sistema completo)

Se corrió una revisión adversarial del árbol completo (ángulos de correctitud/cleanup del skill `code-review`). Hallazgos y resolución:

| # | Hallazgo | Severidad | Resolución |
|---|---|---|---|
| 1 | **Idempotency-Key global**, no scopeada por usuario (contradecía `DOMAIN_SPEC §8`). El reuso del mismo valor por dos usuarios podía devolver la transferencia del otro. | Confirmado | **Corregido:** PK compuesto `(user_id, idempotency_key)`, `request_hash` con `sender_id`, migración `ScopeIdempotencyPerUser`, y test e2e cross-user. Verificado (PK compuesto en DB, invariantes `PASS`). |
| 2 | `VELOCITY` subreporta la ráfaga (ventana solo hacia atrás). | Plausible, menor | Documentado como limitación conocida; el emisor igual aparece en el reporte. |

Este es el valor del review con contexto fresco: encontró una discrepancia diseño-vs-código que las suites en verde no detectaban.
