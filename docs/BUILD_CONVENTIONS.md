# BUILD_CONVENTIONS — MiniWallet (NestJS)

Convenciones que el build va a respetar, derivadas de la skill `nestjs-best-practices`. No es código: es el contrato de cómo se escribe, para que el review en vivo no encuentre sorpresas. Se prioriza por impacto (Arquitectura y DI = críticos).

## 1. Arquitectura (crítico)
- **Módulos por feature, no por capa** (`arch-feature-modules`): `auth`, `transfers`, `compliance`, `ledger`, `audit`, `history` — ver `DIAGRAMS/components.md`. Nada de carpetas `controllers/`, `services/` planas.
- **Repository pattern** (`arch-use-repository-pattern`): la lógica de acceso a datos se abstrae detrás de repositorios, para poder testear la lógica transaccional sin DB real donde aplique.
- **Servicios de responsabilidad única** (`arch-single-responsibility`): `TransfersService` no sabe de compliance; `ComplianceService` no liquida settlement automático. Refleja la regla no negociable del `CLAUDE.md`.
- **Sin dependencias circulares** entre módulos (`arch-avoid-circular-deps`): `LedgerModule` no importa a quienes lo usan.

## 2. Dependency Injection (crítico)
- **Inyección por constructor** siempre (`di-prefer-constructor-injection`).
- **Interfaces vía injection tokens** para lo que tenga más de una implementación posible (ej. detector de sospechosas) (`di-use-interfaces-tokens`).
- Conciencia de **scope**: servicios singleton salvo razón explícita (`di-scope-awareness`).

## 3. Errores (alto)
- **Exception filter global** (`error-use-exception-filters`) que traduce errores de dominio a la respuesta con **código semántico** + status HTTP (catálogo en `DOMAIN_SPEC.md` §6). Esto cumple la restricción "códigos de respuesta semánticos, no solo HTTP".
- Errores de dominio tipados (ej. `InsufficientBalanceError`) → mapeados en el filtro, no `throw new HttpException` suelto por todo el código.

## 4. Seguridad (alto)
- **JWT** con guard de autenticación (`security-auth-jwt`, `security-use-guards`); guard adicional de rol para los endpoints admin.
- **Validación de TODO input** con `class-validator` + DTOs (`security-validate-all-input`); pipe de validación global.
- Password con hash (bcrypt/argon2), nunca en claro.

## 5. Base de datos (medio-alto)
- **Transacciones** para toda operación que toca dinero (`db-use-transactions`): la transferencia es una unidad atómica (dedup idempotencia + lock + asientos + saldos + auditoría) en una sola tx.
- **Migraciones** para el esquema (`db-use-migrations`), no `synchronize: true` en nada que parezca producción.
- Cuidado con **N+1** en el historial (`db-avoid-n-plus-one`).

## 5b. Ledger y dinero (skill `ledger-accounting-validator`) — CRÍTICO
- **`ledger_entries` es append-only:** exponer **solo `.insert()`** vía un servicio dedicado. Nunca `.update()`/`.remove()` sobre esa entidad (aunque TypeORM lo permita). El saldo se recalcula desde el ledger, nunca se edita a mano.
- **Prohibido `UPDATE balance = balance ± x`** suelto. Todo movimiento pasa por un journal balanceado (suma cero) dentro de una sola tx DB.
- **Hold con contra-cuenta:** las ≥$1000 acreditan a `COMPLIANCE_HOLD`, nunca "débito sin crédito".
- **Idempotencia desde el primer commit:** `POST /transfers` recibe `Idempotency-Key` del cliente; dedup dentro de la misma tx (ver `DATA_MODEL.md` §5). No se agrega "después".
- **Locks en orden determinístico** (por `account_id` asc) para evitar deadlocks.
- **Validador de invariantes** (`DOMAIN_SPEC.md` §7) corrido **tras carga concurrente adversarial** antes de dar la feature por terminada.

## 6. Testing (medio-alto)
- **E2E con Supertest** (`test-e2e-supertest`) para el test de integración obligatorio del flujo de transferencia (TC-INT-1).
- `Test.createTestingModule` para unitarios (`test-use-testing-module`).

## 7. API y DevOps
- **Gestor de paquetes: `pnpm`** (no npm ni yarn). Se commitea `pnpm-lock.yaml`; el Dockerfile usa `corepack enable` + `pnpm install --frozen-lockfile` para builds reproducibles. Los scripts se corren con `pnpm <script>`.
- **DTOs + serialización** de salida (`api-use-dto-serialization`): nunca devolver la entidad cruda (no filtrar `password_hash`).
- **ConfigModule** para env vars (`devops-use-config-module`): secreto JWT y credenciales DB desde entorno.
- **Graceful shutdown** (`devops-graceful-shutdown`) para no cortar transferencias en vuelo al reiniciar.

> Estas convenciones se **verifican en el review fresco del diff** (paso 7 del harness del proyecto), no solo corriendo los tests.
