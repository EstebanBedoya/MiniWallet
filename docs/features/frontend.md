# Feature: Frontend web (mobile-first)

Interfaz de usuario para consumir **todos** los endpoints de la API MiniWallet, respetando
la lógica de dominio (ledger de doble entrada, holds de compliance, idempotencia, códigos
de error semánticos). Es un consumidor puro: **no mueve dinero ni cambia estado por sí
mismo** — toda operación pasa por la API, que mantiene los invariantes contables.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Base UI) · IBM Plex Sans/Mono.
Servido en Docker (`web`) con `output: standalone`; comunicación con la API vía `rewrites`
(proxy same-origin, ver ADR-018). Vive en `frontend/`, separado del backend.

## Comportamiento esperado

### Auth
- **Registro** (`POST /auth/register`): nombre + email + password (mín. 8). Tras crear la
  cuenta, hace login automático (register no devuelve token) y entra a la app. El backend
  provisiona wallet + saldo semilla en la misma transacción.
- **Login** (`POST /auth/login`): email + password → JWT. Error genérico `INVALID_CREDENTIALS`
  (no revela qué campo falló).
- **Sesión**: token en `localStorage`, adjuntado como `Authorization: Bearer`. Guard
  client-side; un `401` limpia la sesión y redirige a `/login` (ADR-019).
- **Rol**: se decodifica el claim `role` del JWT para mostrar/ocultar el panel admin. El
  backend valida el rol en cada request.

### Pantallas
- **Dashboard** (`/dashboard`): saldo disponible (`GET /accounts/me`) + últimos 5 movimientos
  (`GET /transactions`). El admin (sin wallet) ve una nota neutral en vez del saldo.
- **Transferencia** (`/transfer`): destinatario (id numérico) + monto. Valida en cliente el
  mismo contrato que la API (`^\d+(\.\d{1,2})?$`, `> 0`, no self-transfer). Genera un
  `Idempotency-Key` (`crypto.randomUUID`) por intento y lo reusa en reintentos.
- **Historial** (`/history`): lista paginada (`page`/`limit`) con badges de estado y dirección.
- **Admin / Compliance** (`/admin`, solo rol ADMIN): tab "Aprobaciones" (holds pendientes,
  aprobar/rechazar con confirmación) + tab "Sospechosas" (reporte con `reasons`).

## Estados que consume (máquina de estados de DOMAIN_SPEC §2)

| Estado | Cómo lo muestra la UI |
|---|---|
| `SETTLED` | Badge verde "Liquidada". Transferencia < $1000 o hold aprobado. |
| `PENDING_REVIEW` | Badge ámbar "En revisión". Hold ≥ $1000; el saldo del emisor ya se descontó. |
| `APPROVED` | Badge violeta "Aprobada" (transitorio; en la práctica se ve directo `SETTLED`). |
| `REJECTED` | Badge rojo "Rechazada". Hold reembolsado al emisor. |

## Relación con el modelo de dominio (reglas no negociables reflejadas en la UI)

- **Umbral hold ≥ $1000**: antes de enviar, un aviso ámbar explica que va a revisión de
  compliance y que el saldo se descuenta al instante. Respuesta **202 ≠ error**: se renderiza
  como "enviada, en revisión".
- **Débito inmediato del emisor** en holds: el dashboard refleja el saldo ya descontado.
- **Acreditación al receptor solo tras aprobar**: verificado en el flujo e2e.
- **Idempotencia por usuario**: `Idempotency-Key` fresco por transferencia, reusado en retry.
- **Códigos semánticos**: los errores se traducen por `code` (no por status ni message) a
  mensajes en español (`src/lib/errors.ts`).
- **Estados terminales**: aprobar/rechazar deshabilitado para lo que no está en `PENDING_REVIEW`.

## Restricción conocida (ADR-020)

El panel de Aprobaciones se alimenta de `GET /admin/transactions/suspicious` filtrando
`PENDING_REVIEW`, porque la API no expone un listado de "todas las pendientes". Es correcto
porque todo hold ≥ $1000 se marca `HIGH_AMOUNT` y aparece garantizado en el reporte.

## Casos de prueba (verificados end-to-end contra el stack en Docker)

| # | Caso | Resultado esperado | Estado |
|---|---|---|---|
| FE-1 | Registro → auto-login → dashboard | Saldo semilla $5.000,00 visible | ✅ |
| FE-2 | Transferencia $250 (< $1000) | 201, badge SETTLED, saldo −250 | ✅ (curl) |
| FE-3 | Transferencia $1500 (≥ $1000) | Aviso de hold, 202, badge "En revisión", saldo −1500 al instante, receptor NO acreditado | ✅ (UI) |
| FE-4 | Gating de rol | Tab "Compliance" oculto para USER, visible para ADMIN | ✅ (UI) |
| FE-5 | Admin sin wallet | Nota neutral en dashboard (no error rojo); aterriza en `/admin` | ✅ (UI) |
| FE-6 | Aprobar hold (con confirmación) | Toast, tx pasa a SETTLED, receptor acreditado recién ahí | ✅ (UI) |
| FE-7 | Rechazar hold | Emisor reembolsado, tx REJECTED | ✅ (API) |
| FE-8 | No-admin en endpoint admin | 403 FORBIDDEN, mensaje semántico | ✅ (curl) |
| FE-9 | Errores de negocio | self-transfer / monto 0 / saldo insuficiente / receiver inexistente → mensaje en español | ✅ |
| FE-10 | Responsive | Mobile-first, bottom nav, sin scroll horizontal a 390px | ✅ |
