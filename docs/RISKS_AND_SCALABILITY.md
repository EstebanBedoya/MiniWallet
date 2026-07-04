# RISKS_AND_SCALABILITY — MiniWallet

Consolida los riesgos dispersos en el análisis y el plan de escalabilidad. El criterio de evaluación "Diseño 25%" pide explícitamente **riesgos identificados**. Este doc alimenta la sección "Cómo escalaría esto" del `README.md`.

Sigue la skill `architecture-designer`: cada riesgo con **impacto → mitigación**, sin sobre-ingeniería para escala hipotética.

## 1. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación (esta versión) |
|---|---|---|---|
| R1 | **Sobregiro por concurrencia** (lost update en el saldo) | Crítico — dinero duplicado | `SELECT … FOR UPDATE` sobre `accounts` + `CHECK (balance_available >= 0)` como red de seguridad en DB. Tests TC-CONC-1..2. |
| R2 | **Deadlock** en transferencias cruzadas (A→B y B→A) | Alto — transferencias trabadas | Locks tomados en **orden determinístico por `account_id`**. Test TC-CONC-4. |
| R3 | **Deriva entre saldo materializado y ledger** | Alto — el saldo mostrado miente | `ledger_entries` es la fuente de verdad; el validador contable (`DOMAIN_SPEC.md` §7) reconstruye desde el ledger y compara contra `accounts`. |
| R4 | **Doble gasto durante el hold** (≥ $1000) | Crítico | El `balance_available` se descuenta al instante al crear el `PENDING_REVIEW`, antes de la aprobación (T1/S6). |
| R5 | **Evasión del umbral por fraccionamiento** (structuring) | Medio — regulatorio | Criterio C3 en el detector de sospechosas (`DOMAIN_SPEC.md` §4). |
| R6 | **Cola de compliance sin atender** crece | Medio — UX y fondos retenidos | Fuera de alcance operar SLA; se deja visible vía `transactions_pending_idx`. Mejora futura: alertas/expiración. |
| R7 | **Secreto JWT / credenciales DB filtrados** | Alto — seguridad | Vía variables de entorno, nunca en el repo. Sin refresh token (alcance S10). |
| R8 | **Precisión monetaria** | Alto | `NUMERIC(20,2)`, nunca float (ver `DATA_MODEL.md` §1). |
| R9 | **Punto único de falla** (una API, una DB) | Medio (aceptado en esta versión) | Aceptado a conciencia; el camino de mitigación está en §2. |
| R10 | **Duplicación por reintento del cliente** (timeout de red en `POST /transfers`) | Crítico — dinero duplicado | Idempotencia con `Idempotency-Key` del cliente + tabla de dedup en la misma tx (`DATA_MODEL.md` §5, ADR-008). Tests TC-IDEM-1..4. |
| R11 | **Journals rotos que se cancelan** (global cuadra, entries individuales no) | Alto — deriva silenciosa | Invariante #3 (cada journal suma cero) en el validador, corrido tras carga adversarial (`DOMAIN_SPEC.md` §7, TC-INV-3/5). |

## 2. Cómo escalaría (plan, NO implementado)

Ordenado por lo que pincharía primero bajo carga:

1. **API stateless → réplicas horizontales.** La API no guarda estado en memoria (JWT stateless, estado en DB). Se replica detrás de un balanceador sin cambios de código. Barato y primero.
2. **Lecturas → réplicas de solo-lectura.** Historial y detección de sospechosas son read-heavy: van a réplicas de Postgres. Las escrituras (transferencias) siguen en el primario.
3. **Contención de lock en cuentas calientes.** El `FOR UPDATE` serializa por cuenta. Si una cuenta es un hot-spot (ej. cuenta de tesorería), se pasa a un modelo de **particionamiento de saldo** (sub-cuentas) o a un patrón de **cola por cuenta** que serializa sin bloquear la DB.
4. **Compliance asíncrono.** Hoy la revisión ≥ $1000 es manual y síncrona en estado. A escala, el hold dispara un **evento** a una cola (ledger sigue siendo la verdad) y un worker/servicio de riesgo resuelve. La máquina de estados **ya lo soporta** sin cambios: solo cambia quién dispara `APPROVED`/`REJECTED`.
5. **Volumen del ledger.** `ledger_entries` crece sin parar (append-only). A decenas de millones de filas: **particionar por rango de `created_at`** (o TimescaleDB) y archivar particiones frías.

> Principio: no se implementa nada de esto ahora (sería sobre-ingeniería para el alcance de la prueba). Se documenta el **camino**, que es lo que el criterio de evaluación pide.
