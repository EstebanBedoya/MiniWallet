# Feature: Hold de compliance ≥ $1000 (Slice 4)

Resuelve la **tensión central T1**: reflejo inmediato en el emisor + validación previa a confirmar. Toca dinero y estado → validador de invariantes es gate.

Relación con el dominio: implementa el camino `PENDING_REVIEW → APPROVED → SETTLED / REJECTED` (`DOMAIN_SPEC.md` §2), la cuenta de sistema `COMPLIANCE_HOLD`, la tabla `audit_log`, y la autorización de administrador. Reemplaza el placeholder `COMPLIANCE_HOLD_NOT_AVAILABLE` del Slice 3.

## Separación de caminos (regla no negociable del proyecto)
El settlement automático (< $1000) y el hold de compliance (≥ $1000) son **dos caminos de estado distintos**, en **métodos/servicios separados**:
- `TransfersService.transfer` decide la ruta (idempotencia + validación comunes) y delega.
- `< $1000` → settlement inmediato (`SETTLED`).
- `≥ $1000` → `ComplianceService.placeHold` (`PENDING_REVIEW`).
- Aprobación/rechazo → `ComplianceService.approve` / `.reject`.

## Comportamiento

### Crear hold (`POST /transfers`, monto ≥ $1000)
En la misma transacción DB (dentro del wrapper de idempotencia):
- Crea `transactions` con status `PENDING_REVIEW`.
- Journal `TRANSFER_HOLD`: `USER_A −m`, `COMPLIANCE_HOLD +m`. El emisor queda descontado **al instante** (evita doble gasto, S6); el receptor **no** recibe nada aún.
- Registra auditoría (`TRANSFER_HELD`, estado → `PENDING_REVIEW`).
- Responde `202` con status `PENDING_REVIEW` y código `TRANSACTION_PENDING_REVIEW`.

### Aprobar (`POST /admin/transactions/:id/approve`, solo ADMIN)
- Valida estado `PENDING_REVIEW` (si no → error semántico según la máquina de estados).
- Transición `PENDING_REVIEW → APPROVED → SETTLED` (ambas auditadas por separado).
- Journal `HOLD_RELEASE`: `COMPLIANCE_HOLD −m`, `USER_B +m`. Recién ahí el receptor recibe.

### Rechazar (`POST /admin/transactions/:id/reject`, solo ADMIN)
- Valida estado `PENDING_REVIEW`.
- Transición `PENDING_REVIEW → REJECTED`.
- Journal `HOLD_REFUND`: `COMPLIANCE_HOLD −m`, `USER_A +m`. El emisor recupera el hold. El receptor nunca vio el dinero.

## Autorización de administrador
- `users.role` (`USER` | `ADMIN`). El JWT lleva `role`; un `AdminGuard` protege los endpoints admin (no-admin → `403`).
- Un usuario admin se bootstrapea al arranque desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotente).

## Trazabilidad
Tabla `audit_log` (append-only): actor, acción, `transaction_id`, estado anterior → nuevo, timestamp. Se registra en crear-hold, aprobar (2 transiciones), rechazar, y settlement directo del Slice 3.

## Errores (amplían `DOMAIN_SPEC.md` §6)
| Código | HTTP | Cuándo |
|---|---|---|
| `TRANSACTION_PENDING_REVIEW` | 202 | Informativo: la transferencia quedó retenida. |
| `TRANSACTION_NOT_PENDING_REVIEW` | 409 | Aprobar/rechazar algo que no está en `PENDING_REVIEW`. |
| `TRANSACTION_ALREADY_SETTLED` | 409 | Operar sobre una terminal `SETTLED`. |
| `TRANSACTION_ALREADY_REJECTED` | 409 | Operar sobre una terminal `REJECTED`. |
| `TRANSACTION_NOT_FOUND` | 404 | La transacción no existe. |
| `FORBIDDEN` | 403 | Endpoint admin accedido por no-admin. |

## Casos de prueba
| ID | Tipo | Caso | Esperado |
|---|---|---|---|
| TC-HOLD-1 | 🎯 | A transfiere $1500 | 202 `PENDING_REVIEW`; A −1500 (en HOLD); B sin cambios; `COMPLIANCE_HOLD` +1500 |
| TC-HOLD-4 | 🎯 | Admin aprueba | `SETTLED`; B +1500; HOLD vuelve a 0 |
| TC-HOLD-5 | 🎯 | Admin rechaza | `REJECTED`; A recupera 1500; B nunca recibió; HOLD a 0 |
| TC-HOLD-2 | 🟡 | Transferir exactamente $1000 | `PENDING_REVIEW` (umbral `>=`, S7) |
| TC-HOLD-7 | 🔴 | Aprobar una ya `SETTLED` | 409 `TRANSACTION_ALREADY_SETTLED` |
| TC-HOLD-9 | 🔴 | Aprobar algo no `PENDING_REVIEW` | 409 `TRANSACTION_NOT_PENDING_REVIEW` |
| TC-ADMIN-1 | 🔴 | No-admin llama endpoint admin | 403 |
| TC-INV | 🟡 | Invariantes tras hold/approve/reject | Los 5 `PASS` (incluida la cuenta HOLD) |

## Decisiones (van a DECISIONS.md)
- Autorización admin vía `role` en JWT + bootstrap por env → ADR.
- `APPROVED` persistido como transición auditada aunque el estado final sea `SETTLED` → nota de diseño.
