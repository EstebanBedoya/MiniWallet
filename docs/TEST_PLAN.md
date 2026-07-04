# TEST_PLAN — MiniWallet

Casos de prueba derivados de `docs/DOMAIN_SPEC.md`, escritos **antes** del código (TDD). Cada caso referencia la sección de la spec que lo origina. Nomenclatura: `TC-<área>-<n>`.

Leyenda de tipo: 🟢 feliz · 🟡 límite · 🔴 error · ⚡ concurrencia · 🎯 tensión resuelta (T1).

---

## 1. Autenticación (RF1)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-AUTH-1 | 🟢 | Registro con datos válidos | 201, usuario creado, saldo semilla inicial (S1) registrado como asiento de ledger |
| TC-AUTH-2 | 🟢 | Login con credenciales correctas | 200 + JWT válido |
| TC-AUTH-3 | 🔴 | Login con password incorrecto | 401 `UNAUTHORIZED`, sin token |
| TC-AUTH-4 | 🔴 | Acceso a endpoint protegido sin token | 401 `UNAUTHORIZED` |
| TC-AUTH-5 | 🔴 | Acceso con JWT expirado | 401 `UNAUTHORIZED` |

## 2. Transferencia < $1000 — settlement inmediato (T3, S5)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-XFER-1 | 🟢 | A ($500) transfiere $200 a B | Transacción directo a `SETTLED`. `balance_available` A −$200, B +$200. Dos asientos (débito+crédito). |
| TC-XFER-2 | 🟡 | Transferir exactamente el saldo disponible completo | OK, `balance_available` del emisor queda en 0 (no negativo) |
| TC-XFER-3 | 🔴 | Transferir más que el saldo disponible | 422 `INSUFFICIENT_BALANCE`, ningún asiento escrito, saldos intactos |
| TC-XFER-4 | 🔴 | Emisor == receptor | 422 `SELF_TRANSFER_NOT_ALLOWED` |
| TC-XFER-5 | 🔴 | Receptor inexistente | 404 `RECEIVER_NOT_FOUND` |
| TC-XFER-6 | 🟡 | Monto 0 o negativo | 422 error de validación, rechazado |

## 3. Transferencia ≥ $1000 — hold de compliance (🎯 T1, S6, S7)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-HOLD-1 | 🎯 | A ($5000) transfiere $1500 a B | Transacción → `PENDING_REVIEW`. `balance_available` A **−$1500 al instante** (hold). B **sin cambios**. Respuesta `TRANSACTION_PENDING_REVIEW`. |
| TC-HOLD-2 | 🎯🟡 | Transferir exactamente $1000 | Con `>= $1000` (S7) → `PENDING_REVIEW`. **Este test blinda la decisión del umbral.** |
| TC-HOLD-3 | 🎯🟡 | Transferir $999.99 | < umbral → `SETTLED` inmediato. Confirma el borde inferior. |
| TC-HOLD-4 | 🎯 | Admin **aprueba** una `PENDING_REVIEW` | `PENDING_REVIEW → APPROVED → SETTLED`. Recién ahí B recibe +$1500. Hold del emisor confirmado. |
| TC-HOLD-5 | 🎯 | Admin **rechaza** una `PENDING_REVIEW` | `→ REJECTED`. Asiento inverso: A recupera $1500 en `balance_available`. B nunca vio el dinero. |
| TC-HOLD-6 | 🟡 | Durante el hold, el `balance_available` del emisor refleja el descuento | El emisor **no puede** gastar el monto retenido (evita doble gasto, S6) |
| TC-HOLD-11 | 🎯 | Verificar la cuenta de sistema `COMPLIANCE_HOLD` durante el hold | Su balance sube exactamente $m; el journal `USER_A −m / HOLD +m` suma cero (doble entrada) |
| TC-HOLD-12 | 🎯 | Tras aprobar/rechazar, `COMPLIANCE_HOLD` vuelve a cero para esa tx | El HOLD no acumula dinero fantasma; libera al receptor (aprobar) o al emisor (rechazar) |
| TC-HOLD-7 | 🔴 | Aprobar una transacción ya `SETTLED` | 409 `TRANSACTION_ALREADY_SETTLED` |
| TC-HOLD-8 | 🔴 | Rechazar una transacción ya `REJECTED` | 409 `TRANSACTION_ALREADY_REJECTED` |
| TC-HOLD-9 | 🔴 | Aprobar algo que no está en `PENDING_REVIEW` | 409 `TRANSACTION_NOT_PENDING_REVIEW` |
| TC-HOLD-10 | 🔴 | Transición inválida (`APPROVED → REJECTED`) | 409 `INVALID_STATE_TRANSITION` |

## 4. Concurrencia (⚡ T2, DOMAIN_SPEC §5)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-CONC-1 | ⚡ | Emisor con $100. Dos transferencias de $80 **simultáneas** | **Exactamente una** tiene éxito; la otra falla `INSUFFICIENT_BALANCE`. Saldo final nunca negativo. |
| TC-CONC-2 | ⚡ | N transferencias concurrentes desde la misma cuenta que en total exceden el saldo | Solo pasan las que caben; suma de débitos ≤ saldo inicial. Sin sobregiro. |
| TC-CONC-3 | ⚡ | Transferencias concurrentes entre pares de cuentas **distintas** | No se bloquean entre sí; todas exitosas (verifica que el lock es por cuenta, no global) |
| TC-CONC-4 | ⚡ | A→B y B→A simultáneas (riesgo de deadlock) | Ambas resuelven sin deadlock (locks en orden determinístico por id) |

## 4b. Idempotencia (DOMAIN_SPEC §8)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-IDEM-1 | 🟢 | Dos POST /transfers con la **misma** `Idempotency-Key` y mismos params | Se crea **una sola** transferencia; el 2º devuelve el resultado del 1º, sin duplicar dinero |
| TC-IDEM-2 | ⚡ | Dos POST **concurrentes** con la misma key (simula reintento por timeout) | Exactamente uno ejecuta; el otro obtiene el mismo resultado. Un solo asiento en el ledger |
| TC-IDEM-3 | 🔴 | Misma key, **params distintos** (otro monto/receptor) | 409 `IDEMPOTENCY_KEY_CONFLICT`, no ejecuta |
| TC-IDEM-4 | 🔴 | POST /transfers **sin** `Idempotency-Key` | Rechazado (header obligatorio) |

## 5. Historial (RF3)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-HIST-1 | 🟢 | Usuario con movimientos consulta historial | Lista paginada, orden consistente (ej. más reciente primero) |
| TC-HIST-2 | 🟡 | Paginación: página fuera de rango | Lista vacía, sin error |
| TC-HIST-3 | 🟡 | Usuario sin movimientos | Lista vacía, 200 |
| TC-HIST-4 | 🔴 | Un usuario intenta ver historial de otro | 401/403, no expone datos ajenos |

## 6. Transacciones sospechosas (RF4, DOMAIN_SPEC §4)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-SUSP-1 | 🟢 | Existe una transferencia ≥ $1000 (C1) | Aparece en el reporte admin |
| TC-SUSP-2 | 🎯 | Emisor hace ≥ N transferencias en la ventana corta (C2) | Se marca por velocity |
| TC-SUSP-3 | 🎯 | Emisor hace varias de $900–$999 que suman > $1000 (C3, structuring) | Se marca por fraccionamiento — **el caso que prueba que "sospechosa" se definió con criterio, no copiando el umbral** |
| TC-SUSP-4 | 🟡 | Transferencia que deja al emisor casi en 0 (C4) | Se marca por vaciado |
| TC-SUSP-5 | 🔴 | Usuario no-admin consulta el endpoint | 401/403 |
| TC-SUSP-6 | 🟢 | Marcar como sospechosa **no** cambia el estado ni bloquea la transacción | Detección ≠ acción (solo reporta) |

## 7. Invariante contable (gate, DOMAIN_SPEC §7)

| ID | Tipo | Caso | Resultado esperado |
|---|---|---|---|
| TC-INV-1 | 🟡 | Invariante #1 (conservación): `SUM(amount)` de todo el ledger = 0 / `SUM(balance)` de todas las cuentas = 0 | Se cumple siempre |
| TC-INV-2 | 🟡 | Invariante #2: ninguna cuenta `USER`/`COMPLIANCE_HOLD` negativa | Se cumple siempre |
| TC-INV-3 | 🟡 | Invariante #3: **cada journal** suma cero (`GROUP BY journal_id HAVING SUM(amount) <> 0` → 0 filas) | Se cumple siempre |
| TC-INV-4 | 🟡 | El `accounts.balance` cacheado == reconstrucción desde `ledger_entries` | Sin deriva |
| TC-INV-5 | ⚡🎯 | **Correr los invariantes #1–#4 DESPUÉS de carga concurrente adversarial** (mix de <$1000, ≥$1000, aprobaciones, rechazos y reintentos en paralelo) | Los 4 invariantes siguen cumpliéndose — el sistema no miente sobre el dinero ni bajo estrés |

---

## Test de integración obligatorio (restricción técnica)

**TC-INT-1** — Flujo end-to-end sobre transferencia, con DB real (contenedor):
registro de A y B → login → A transfiere < $1000 a B (`SETTLED`, saldos correctos) → A transfiere ≥ $1000 a B (`PENDING_REVIEW`, hold) → admin aprueba (`SETTLED`, B acreditado) → validación de invariante contable. Cubre RF1, RF2, T1 y el gate contable en un solo recorrido.
