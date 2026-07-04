# MiniWallet — Guía para agentes de código

## Stack
- Backend: NestJS + TypeORM + PostgreSQL
- Infra: Docker Compose (arranque con un solo comando: `docker compose up`)
- Auth: JWT
- Tests: Jest (unitarios) + test de integración sobre el flujo de transferencia

## Modelo de dominio (no renegociable sin actualizar docs/DOMAIN_SPEC.md)
- Ledger de doble entrada: cada transferencia genera un débito y un crédito, nunca un UPDATE directo de balance.
- `balance_available` (gastable ya) vs `balance_ledger` (contable total).
- Estados de transacción: `PENDING_REVIEW` → `APPROVED` / `REJECTED` → `SETTLED`.
- Transferencias < $1000 USD: van directo a `SETTLED`, impactan `balance_available` al instante.
- Transferencias ≥ $1000 USD: descuentan `balance_available` del emisor al instante (evita doble gasto), pero NO acreditan al receptor hasta `APPROVED`. Quedan en `PENDING_REVIEW`.
- Nunca se pierde ni duplica dinero: toda operación es atómica a nivel de transacción DB + invariante contable (ver validador abajo).

## Harness — toda feature nueva sigue este flujo, en orden

1. **SPEC primero.** Crear/actualizar `docs/features/<nombre-feature>.md` con: comportamiento esperado, estados que introduce o modifica, casos límite, y cómo se relaciona con el modelo de dominio de arriba. No se toca código sin esto.
2. **TEST_PLAN.** A partir de la spec, listar los casos de prueba en `docs/features/<nombre-feature>.md` (sección "Casos de prueba") o en `TEST_PLAN.md` si es transversal. Incluir siempre: caso feliz, caso límite, caso concurrente (si toca balance).
3. **Build por vertical slice, TDD estricto.** Rojo → verde → refactor. Un slice a la vez. No arrancar el siguiente endpoint/módulo sin que el anterior tenga tests en verde.
4. **Si la feature toca dinero o estado transaccional:** correr el validador de consistencia contable antes de dar la feature por terminada:
   - `sum(débitos) == sum(créditos)` en todo el ledger
   - ningún `balance_available` quedó negativo
   - toda transacción tiene un estado válido según la máquina de estados de arriba
5. **DECISIONS.md.** Si hubo una decisión de diseño no trivial (elegir una librería, un patrón de concurrencia, un trade-off), documentarla ahí en formato ADR corto: contexto → decisión → alternativas consideradas → consecuencias.
6. **AI_USAGE.md.** Registrar qué generó IA, en qué parte, y cómo se validó (tests corridos, revisión manual, qué se cambió del output original). Sin excepciones — esto se evalúa explícitamente.
7. **No dar una feature por completa sin review fresco del diff completo** (releer cada línea entregada, no solo correr los tests).

## Reglas de trazabilidad
- Toda operación financiera queda registrada en una tabla de auditoría (quién, cuándo, qué cambió, estado anterior/nuevo).
- Errores de negocio usan códigos semánticos propios (ej. `INSUFFICIENT_BALANCE`, `TRANSACTION_PENDING_REVIEW`), no solo status HTTP.

## Qué NO hacer
- No usar `UPDATE balance = balance - x` directo. Siempre a través del ledger.
- No mezclar la lógica de "settlement automático" con la de "hold de compliance" en el mismo método — son dos caminos de estado distintos.
- No marcar una feature como terminada sin correr el validador contable si tocó dinero.