# Feature: Ledger core (Slice 2)

Los primitivos contables sobre los que se construyen las transferencias (Slice 3+). Este slice **sí toca dinero** → el validador de invariantes (paso 4 del harness) aplica y es el gate de "terminado".

Relación con el dominio: implementa `accounts`, `journals` y `ledger_entries` (`DATA_MODEL.md`), y el saldo semilla del registro (S1). **No** implementa transferencias entre usuarios todavía (eso es Slice 3).

## Concepto clave: journal

Un **journal** es un evento contable único y balanceado (sus asientos suman cero). Reemplaza el agrupador `transaction_id` que teníamos en `ledger_entries`, porque no todo movimiento es una transferencia (el seed no lo es). Una transferencia (Slice 3) generará uno o más journals a lo largo de su ciclo de vida; un seed genera un journal `SEED`.

`kind` de journal: `SEED`, `TRANSFER_SETTLE`, `TRANSFER_HOLD`, `HOLD_RELEASE`, `HOLD_REFUND` (los de transferencia llegan en Slice 3).

## Cuentas

Tres tipos (`DATA_MODEL.md` §2):
- `USER` — una por usuario, saldo gastable. No-negativa.
- `COMPLIANCE_HOLD` — cuenta de sistema, retiene holds. No-negativa.
- `SYSTEM_FUNDING` — cuenta de sistema, fuente externa (equity). **Puede ir negativa** (representa el dinero total inyectado).

Las dos de sistema se crean una sola vez (bootstrap en la migración).

## Comportamiento

### `LedgerService.postJournal(kind, lines[])` — el único portón al dinero
- Recibe un conjunto de líneas `{ accountId, amount }` con monto **firmado** (`+` crédito / `−` débito).
- **Rechaza** si las líneas no suman cero (`UNBALANCED_JOURNAL`) — defensa en código además del validador.
- En **una** transacción DB: bloquea las cuentas involucradas (`FOR UPDATE`, ordenadas por `account_id` asc para evitar deadlocks) → inserta el journal + sus asientos → actualiza el `balance` cacheado de cada cuenta → commit.
- Valida no-negatividad donde aplica (USER/HOLD); el `CHECK` de la DB es la última línea de defensa.
- Es **atómico**: todo o nada.

### Provisión de cuenta + seed al registrarse
- Al registrarse un usuario (extiende Slice 1), en la **misma transacción** que crea el `users`: se crea su cuenta `USER` y se acredita el saldo semilla con un journal `SEED` (`SYSTEM_FUNDING −S`, `USER_A +S`).
- Monto semilla `S` configurable (`SEED_BALANCE`, default `5000.00`).
- Nunca por `UPDATE` directo: el seed es un journal como cualquier otro.

### Consulta de saldo — `GET /accounts/me`
- Ruta protegida (JWT). Devuelve `balance_available` del usuario (su `accounts.balance`), y el pendiente (0 en este slice; entrante/saliente llegan con transferencias).

## Estados
Este slice no introduce máquina de estados de transacción (eso es Slice 3). Los journals son inmutables (append-only), no transicionan.

## Casos límite y errores
| Código | HTTP | Cuándo |
|---|---|---|
| `UNBALANCED_JOURNAL` | 500 (bug interno) | Se intentó postear un journal cuyas líneas no suman cero. Nunca debería pasar por API; es guarda de programación. |
| `ACCOUNT_NOT_FOUND` | 404 | Consulta de saldo de un usuario sin cuenta. |

## Validador de invariantes (gate del paso 4)
Tras las operaciones, deben cumplirse los 3 invariantes universales (`DOMAIN_SPEC.md` §7):
1. `SUM(amount)` de todo `ledger_entries` = 0 **y** `SUM(balance)` de todas las cuentas = 0.
2. Ninguna cuenta `USER`/`COMPLIANCE_HOLD` negativa.
3. Cada journal suma cero: `GROUP BY journal_id HAVING SUM(amount) <> 0` → 0 filas.
4. `accounts.balance` cacheado == reconstrucción desde `ledger_entries`.

## Casos de prueba
| ID | Tipo | Caso | Esperado |
|---|---|---|---|
| TC-LED-1 | 🟢 | Registro → crea cuenta USER con saldo semilla | `balance` = `SEED_BALANCE`; journal `SEED` balanceado |
| TC-LED-2 | 🟢 | `postJournal` balanceado (A −m, B +m) | Actualiza ambos saldos; asientos insertados |
| TC-LED-3 | 🔴 | `postJournal` NO balanceado | Lanza `UNBALANCED_JOURNAL`, no escribe nada |
| TC-LED-4 | 🟡 | Débito que dejaría una cuenta USER negativa | Rechazado (no-negatividad); rollback |
| TC-LED-5 | 🟢 | `GET /accounts/me` tras seed | Devuelve el saldo semilla |
| TC-INV-1..4 | 🟡 | Invariantes tras una tanda de journals | Los 4 se cumplen |
| TC-LED-6 | ⚡ | Dos `postJournal` concurrentes sobre la misma cuenta | Se serializan por el lock; sin saldo corrupto |

## Decisiones (van a DECISIONS.md)
- Tabla `journals` como agrupador contable (reemplaza `ledger_entries.transaction_id`) → ADR.
- Saldo cacheado en `accounts` vs. cálculo on-the-fly → ADR (ya insinuado en ADR-001).
