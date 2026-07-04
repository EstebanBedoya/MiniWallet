# Feature: Historial + transacciones sospechosas (Slice 5)

Cierra los RF3 (historial paginado) y RF4 (endpoint admin de sospechosas). **Solo lectura** — no toca dinero, así que el validador de invariantes no aplica como gate (pero debe seguir en PASS: no modificamos nada).

## Historial — `GET /transactions?page=&limit=` (RF3)

Ruta protegida (JWT). Devuelve las transacciones donde el usuario es **emisor o receptor**, paginadas y ordenadas por `created_at` desc.

- `page` (default 1, ≥ 1), `limit` (default 20, 1..100).
- Respuesta: `{ data: [...], page, limit, total }`.
- Usa el índice `transactions_sender_created_idx (sender_id, created_at DESC)` para el lado emisor.

## Sospechosas — `GET /admin/transactions/suspicious` (RF4, solo ADMIN)

Devuelve las transacciones que cumplen **al menos un** criterio de `DOMAIN_SPEC.md` §4, cada una con sus `reasons`. **Solo reporta**, no bloquea ni cambia estado (detección ≠ acción).

Criterios (umbrales configurables por env — ADR-005):
| Criterio | Regla | Config (default) |
|---|---|---|
| C1 `HIGH_AMOUNT` | `amount >= 1000` | umbral fijo del negocio |
| C2 `VELOCITY` | mismo emisor con ≥ N transferencias en una ventana | `SUSPICIOUS_VELOCITY_COUNT=5`, `SUSPICIOUS_VELOCITY_WINDOW_MIN=1` |
| C3 `STRUCTURING` | mismo emisor con ≥ M transferencias en `[900, 1000)` en una ventana (evasión del umbral) | `SUSPICIOUS_STRUCTURING_COUNT=2`, `SUSPICIOUS_STRUCTURING_WINDOW_MIN=10` |
| C4 `ACCOUNT_DRAIN` | **No implementado** — requiere snapshot del saldo al momento (ADR-005). Documentado, diferido. |

Respuesta: `[{ transactionId, senderId, receiverId, amount, status, createdAt, reasons: [...] }]`.

**Valor del diseño:** C2 y C3 detectan intentos de **evadir** el umbral de compliance (fraccionar por debajo de $1000). C1 solo es el umbral copiado; el criterio real está en C2/C3.

## Errores
| Código | HTTP | Cuándo |
|---|---|---|
| `FORBIDDEN` | 403 | No-admin llama a `/admin/transactions/suspicious`. |
| (validación) | 400 | `page`/`limit` inválidos. |

## Casos de prueba
| ID | Tipo | Caso | Esperado |
|---|---|---|---|
| TC-HIST-1 | 🟢 | Usuario con movimientos | Lista paginada, más reciente primero, `total` correcto |
| TC-HIST-3 | 🟡 | Usuario sin movimientos | `data: []`, 200 |
| TC-HIST-4 | 🔴 | Ver historial sin token | 401 |
| TC-SUSP-1 | 🟢 | Transferencia ≥ $1000 | Aparece con reason `HIGH_AMOUNT` |
| TC-SUSP-3 | 🎯 | Emisor con varias de $900–999 | Aparece con reason `STRUCTURING` — el caso que prueba criterio real |
| TC-SUSP-5 | 🔴 | No-admin | 403 |
| TC-SUSP-6 | 🟢 | Reportar no cambia estado | La transacción sigue en su estado |

## Decisiones
- Umbrales de sospechosas configurables por env (cierra ADR-005).
