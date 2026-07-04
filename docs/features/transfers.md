# Feature: Transferencia < $1000 (Slice 3)

Primer movimiento de dinero entre usuarios: settlement inmediato para montos **< $1000**. Toca dinero → el validador de invariantes es gate.

Relación con el dominio: implementa `transactions` (estado `SETTLED`), `idempotency_keys`, y usa `LedgerService.postJournal` (`TRANSFER_SETTLE`). Los montos **≥ $1000** (hold de compliance) son del Slice 4 — en este slice se rechazan explícitamente con `COMPLIANCE_HOLD_NOT_AVAILABLE` (501), como placeholder honesto.

## Comportamiento — `POST /transfers`

Ruta protegida (JWT). Header **`Idempotency-Key` obligatorio** (generado por el cliente).

Body: `{ receiverId, amount }` (amount decimal string, ej. `"250.00"`).

Flujo (todo en **una** transacción DB):
1. Validaciones: `receiverId != sender` (`SELF_TRANSFER_NOT_ALLOWED`), receptor existe (`RECEIVER_NOT_FOUND`), amount > 0 (validación DTO).
2. **Idempotencia:** se intenta insertar la key. Si ya existe:
   - mismo `request_hash` → devuelve el resultado original (replay), sin re-ejecutar.
   - distinto → `IDEMPOTENCY_KEY_CONFLICT` (409).
3. Si `amount >= 1000` → `COMPLIANCE_HOLD_NOT_AVAILABLE` (501, placeholder Slice 4). Rollback (la key no se persiste).
4. Si `amount < 1000`: crear `transactions` (status `SETTLED`) → `postJournal('TRANSFER_SETTLE', [sender −m, receiver +m], transactionId)`. El pre-check de `postJournal` rechaza saldo insuficiente (`INSUFFICIENT_BALANCE`, 422) y hace rollback.
5. Actualizar la idempotency key con el `transaction_id` y devolver el resultado.

Respuesta 201: `{ transactionId, senderId, receiverId, amount, status: "SETTLED" }`.

## Concurrencia
- `postJournal` bloquea las cuentas (`FOR UPDATE`, orden por `account_id`) → dos transferencias sobre el mismo emisor se serializan; sin sobregiro (T2).
- Dos requests concurrentes con la **misma** `Idempotency-Key`: el PK de `idempotency_keys` serializa (el segundo `INSERT` espera al commit del primero) → exactamente una ejecuta; la otra hace replay.

## Errores (amplían `DOMAIN_SPEC.md` §6)
| Código | HTTP | Cuándo |
|---|---|---|
| `SELF_TRANSFER_NOT_ALLOWED` | 422 | Emisor == receptor. |
| `RECEIVER_NOT_FOUND` | 404 | El receptor no tiene cuenta. |
| `INSUFFICIENT_BALANCE` | 422 | Saldo disponible del emisor insuficiente. |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Misma key, distintos params. |
| `MISSING_IDEMPOTENCY_KEY` | 400 | Falta el header `Idempotency-Key`. |
| `COMPLIANCE_HOLD_NOT_AVAILABLE` | 501 | Monto ≥ $1000 (placeholder hasta Slice 4). |

## Nota sobre trazabilidad
`transactions` + `journals` + `ledger_entries` ya dan el rastro completo (quién, cuánto, cuándo, qué asientos). La tabla `audit_log` explícita (estado anterior→nuevo con actor) se agrega en el Slice 4, donde hay transiciones de estado que auditar.

## Casos de prueba
| ID | Tipo | Caso | Esperado |
|---|---|---|---|
| TC-XFER-1 | 🟢 | A ($5000) transfiere $250 a B | 201 `SETTLED`; A=4750, B=5250; journal balanceado |
| TC-XFER-3 | 🔴 | Transferir más que el saldo | 422 `INSUFFICIENT_BALANCE`, sin cambios |
| TC-XFER-4 | 🔴 | Emisor == receptor | 422 `SELF_TRANSFER_NOT_ALLOWED` |
| TC-XFER-5 | 🔴 | Receptor inexistente | 404 `RECEIVER_NOT_FOUND` |
| TC-XFER-6 | 🟡 | Monto 0 / negativo / >2 decimales | 400 validación |
| TC-IDEM-1 | 🟢 | Reintento misma key + mismos params | Una sola transferencia; 2º = replay |
| TC-IDEM-3 | 🔴 | Misma key, params distintos | 409 `IDEMPOTENCY_KEY_CONFLICT` |
| TC-IDEM-4 | 🔴 | Sin `Idempotency-Key` | 400 `MISSING_IDEMPOTENCY_KEY` |
| TC-HOLD-placeholder | 🟡 | Monto ≥ $1000 | 501 `COMPLIANCE_HOLD_NOT_AVAILABLE` (Slice 4) |
| TC-INT-1 | 🟢 | **Integración** (obligatorio): registro → login → transfer <$1000 → saldos → invariantes | End-to-end verde |
