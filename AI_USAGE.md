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

---

## Evaluación contra el enunciado (cierre de huecos)

Tras una evaluación explícita contra `PRUEBA_TECNICA.md`, se cerraron 4 huecos que las suites en verde no cubrían:

| # | Hueco | Resolución | Verificación |
|---|---|---|---|
| 1 | **Sin test de concurrencia** (NFR explícito + `TEST_PLAN` lo prometía) | 2 tests e2e: 5 transferencias concurrentes sobre el mismo emisor (exactamente 4 pasan, 1 falla, saldo nunca negativo) + cruzadas A↔B sin deadlock | ✅ 10/10 e2e |
| 2 | **Diagramas C4 podían no renderizar en GitHub** | Convertidos a `flowchart`/`sequenceDiagram` (render garantizado), preservando semántica C4 (ADR-007) | ✅ |
| 3 | **Códigos semánticos incompletos** (validación sin `code`) | `AllExceptionsFilter` global normaliza toda respuesta de error (ADR-016) | ✅ |
| 4 | **Sin seguridad básica** | `@nestjs/throttler` (rate limit) + `helmet` (ADR-017) | ✅ 429 al superar límite; headers presentes |

---

## Frontend web (Next.js + shadcn/ui)

| Artefacto | Qué generó la IA | Cómo se validó |
|---|---|---|
| SPEC `docs/features/frontend.md` | Pantallas, estados consumidos, mapeo de errores, restricción del panel admin | Revisión manual contra el mapa real de endpoints (extraído del código) y la máquina de estados de `DOMAIN_SPEC §2`. |
| `frontend/` (Next 16 App Router): capa `lib/` (api client tipado, auth context, decode JWT, mapa de errores, helpers de dinero), pantallas (login/register/dashboard/transfer/history/admin), componentes UI (balance-card, status-badge, transaction-row, bottom-nav), `next.config` con rewrites, Dockerfile standalone | Implementación completa | **Build + lint verdes** (`npm run build`, `npm run lint`). **Verificado end-to-end contra el stack real en Docker** (los 3 servicios): flujo por browser (registro→dashboard, hold ≥$1000 con aviso→202→badge, aprobar con confirmación→SETTLED) + flujo por `curl` a través del proxy (`/api/*`): settle <$1000, hold ≥$1000, approve/reject, 403 no-admin, saldos exactos (emisor −1500 al instante, receptor +1500 recién al aprobar). |
| Diseño visual (paleta navy+dorado+violeta, IBM Plex, WCAG) | Sistema de diseño del motor `ui-ux-pro-max` para producto fintech | Aplicado a tokens shadcn; verificado en dark mode a 390px (mobile-first, sin scroll horizontal, touch targets 44px). |

### Correcciones sobre la salida de IA (no se aceptó ciego)
- **Base UI, no Radix:** el preset de shadcn (Nova) usa Base UI. El `asChild` de Radix no existe → se corrigió a la prop `render` en `Button` y `AlertDialogTrigger`. Además `AlertDialogAction` es un `Button` plano (no cierra solo) → se controló el estado `open` del diálogo explícitamente.
- **Bug de UX encontrado en la verificación por browser:** el usuario admin se crea por bootstrap **sin wallet**, así que `GET /accounts/me` devolvía `ACCOUNT_NOT_FOUND` y el dashboard mostraba un error rojo. Se corrigió: (1) el dashboard tolera la cuenta faltante con una nota neutral (carga saldo e historial de forma independiente vía `Promise.allSettled`), y (2) el admin aterriza en `/admin` (su propósito real) por landing basado en rol.
- **Bug circular de fuentes del scaffold:** `--font-sans: var(--font-sans)` (auto-referencia) caía a serif; se apuntó a la variable real de `next/font` con fallback literal.
- **CVE de Next.js:** se verificó Next ≥ 16.1.5 y React ≥ 19.2.4 (versiones parcheadas) antes de dar por hecho el scaffold.
- **Lint del React Compiler:** los fetch-on-mount disparaban `set-state-in-effect`; se documentaron con `eslint-disable` justificado (uso aceptado de Effect para carga inicial), no se silenció el linter globalmente.
