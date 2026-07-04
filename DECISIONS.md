# DECISIONS — MiniWallet

Registro de decisiones de arquitectura (formato ADR corto: **contexto → decisión → alternativas → consecuencias**).
Las decisiones que se toman recién durante el build quedan marcadas **[PENDIENTE]** — no se resuelven ahora para no inventar de antemano.

---

## ADR-001 — Ledger de doble entrada en vez de un campo `balance` mutable

**Estado:** Aceptada (fase de análisis)

**Contexto.** El requisito duro es "nunca perder ni duplicar dinero", incluso bajo concurrencia y con un flujo de retención por compliance (T1). Un campo `balance` que se actualiza con `UPDATE balance = balance - x` no deja rastro auditable, es frágil ante condiciones de carrera y no distingue dinero disponible de dinero retenido.

**Decisión.** Modelar el dinero como un **ledger de doble entrada, append-only**: cada transferencia genera un asiento de débito y uno de crédito. Los saldos (`balance_available` cacheado; `pendiente` y `balance_contable` derivados) se calculan desde el ledger, nunca se editan directo. La invariante `sum(débitos) == sum(créditos)` se puede verificar en cualquier momento.

**Alternativas consideradas.**
- *Campo `balance` mutable:* más simple, pero no auditable y propenso a lost updates. Descartada por el requisito de trazabilidad y atomicidad.
- *Event sourcing completo:* máxima trazabilidad, pero sobredimensionado para el alcance de 3 días; agrega complejidad de proyecciones que no aporta a la evaluación.

**Consecuencias.**
- (+) Trazabilidad total, invariante contable verificable, separación natural disponible/pendiente.
- (+) El hold de compliance se modela sin casos especiales: es un asiento más.
- (−) Leer un saldo requiere agregación (mitigable con saldos materializados/derivados actualizados en la misma transacción).

---

## ADR-002 — Concurrencia con bloqueo pesimista de fila

**Estado:** Aceptada (fase de análisis)

**Contexto.** Múltiples usuarios transfieren en simultáneo (RF no funcional). Dos débitos concurrentes sobre la misma cuenta pueden ambos leer el saldo viejo y sobregirar (lost update, ver `docs/DOMAIN_SPEC.md` §5). El sobregiro es inaceptable.

**Decisión.** Dentro de la transacción DB de cada transferencia, tomar **bloqueo pesimista** sobre la fila del emisor (`SELECT … FOR UPDATE`) antes de validar y debitar. Las transferencias concurrentes sobre la **misma** cuenta se serializan; sobre cuentas **distintas** no se bloquean.

**Alternativas consideradas.**
- *Bloqueo optimista (versión + reintento):* mejor throughput sin contención, pero en el hot path de "debitar saldo" el conflicto es esperable y el reintento complica el flujo de compliance. Descartada por complejidad vs. beneficio en este alcance.
- *Serializable isolation:* garantía fuerte pero mayor tasa de abortos y reintentos; más difícil de razonar para el revisor en vivo.

**Consecuencias.**
- (+) Garantía dura contra sobregiro, simple de razonar y de testear (TC-CONC-1..4).
- (−) Menor concurrencia sobre una misma cuenta muy activa.
- (−) Riesgo de deadlock en transferencias cruzadas → se mitiga tomando locks en **orden determinístico por id de cuenta**.

---

## ADR-003 — Umbral de compliance interpretado como `>= $1000`

**Estado:** Aceptada, **reversible** (fase de análisis; ver supuesto S7)

**Contexto.** El enunciado dice "mayor a $1,000 USD". "Mayor a" literalmente es `> 1000`, pero un monto de exactamente $1000 es material para compliance.

**Decisión.** Interpretar el umbral como **`amount >= 1000.00`** (`NUMERIC`, ver ADR-006). Se blinda con el test TC-HOLD-2. Cambiar a `> 1000` es un one-liner + ajustar un test.

**Alternativas consideradas.** `> 1000` estricto (lectura literal). Se prefirió la interpretación conservadora de compliance, dejándola explícita y reversible en vez de resolverla en silencio.

**Consecuencias.** (+) Decisión transparente y defendible en la sesión de review. (−) Diverge de la lectura literal; por eso queda documentada como supuesto, no oculta.

---

## ADR-004 — [PENDIENTE] ORM (TypeORM) vs. SQL crudo en el camino crítico

**Contexto.** El camino de débito/lock/asiento es el más sensible. TypeORM da productividad pero puede ocultar el SQL que importa (el `FOR UPDATE`, el aislamiento de la transacción).

**Decisión.** [PENDIENTE] — se decide durante el build si el path crítico usa el query builder/lock de TypeORM o SQL explícito. Criterio: que el lock y la atomicidad sean **legibles y verificables**, no mágicos.

**Alternativas / consecuencias.** [PENDIENTE al implementar]

---

## ADR-005 — Parámetros de detección de transacciones sospechosas

**Estado:** Aceptada (Slice 5) — cerrada

**Contexto.** Los criterios C2 (velocity) y C3 (structuring) tienen umbrales que son **decisión de política de negocio**, no de ingeniería (`docs/DOMAIN_SPEC.md` §4).

**Decisión.** Umbrales **configurables por env**, con defaults sensatos: `SUSPICIOUS_VELOCITY_COUNT=5` en `SUSPICIOUS_VELOCITY_WINDOW_MIN=1`; `SUSPICIOUS_STRUCTURING_COUNT=2` en `SUSPICIOUS_STRUCTURING_WINDOW_MIN=10`, banda `[900, 1000)` (justo bajo el umbral). El endpoint **solo reporta** (detección ≠ acción). **C4 (vaciado de cuenta) queda diferido**: requiere un snapshot del saldo al momento de la transacción, que el modelo actual no persiste; documentado, no implementado.

**Alternativas consideradas.**
- *Umbrales hardcodeados:* rechazado — son política de negocio que cambia sin re-deploy.
- *Motor de reglas / ML:* fuera de alcance (ver `CONTEXT.md`); son heurísticas explicables.

**Consecuencias.** (+) El equipo de compliance ajusta sensibilidad por env sin tocar código; C2/C3 detectan **evasión** del umbral (el valor real). (−) C4 pendiente; para implementarlo hay que snapshotear el saldo en cada transferencia.

---

## ADR-006 — Dinero en `NUMERIC(20,2)`, no enteros de centavos ni float

**Estado:** Aceptada (fase de análisis) — **reemplaza** la interpretación previa de "enteros de centavos"

**Contexto.** El enunciado no define la representación del dinero. La versión inicial del análisis dejaba abierto "entero de centavos o NUMERIC". La skill `postgresql-table-design` es explícita: para dinero, `NUMERIC(p,s)`; nunca `float` (redondeo) ni el tipo `money` (dependiente de locale).

**Decisión.** Representar todo monto como **`NUMERIC(20,2)`** en DB y como decimal exacto en la app. El umbral de compliance es `1000.00`.

**Alternativas consideradas.**
- *Enteros de centavos (`BIGINT`):* válido y libre de redondeo, pero obliga a convertir en cada frontera (API, UI) y es más fácil equivocarse en la escala. Descartada por ergonomía y por alinear con el estándar de la skill.
- *`float`/`double`:* descartada de plano — inaceptable en dinero.

**Consecuencias.** (+) Aritmética exacta, sin conversiones de escala, alineado con el estándar del equipo. (−) `NUMERIC` es algo más lento que enteros en operaciones masivas; irrelevante para este volumen.

---

## ADR-007 — Diagramas en C4 nativo de Mermaid, no `flowchart`

**Estado:** Aceptada (fase de análisis) — **revierte** la decisión previa de usar `flowchart`

**Contexto.** Los primeros diagramas se hicieron con `flowchart` de Mermaid, argumentando compatibilidad de render (el soporte C4 de Mermaid es experimental). Luego se incorporó la skill `c4-architecture`, que estandariza sintaxis **C4 nativa** (`C4Context`, `C4Container`, `C4Component`, `C4Deployment`, `C4Dynamic`).

**Decisión.** Adoptar **C4 nativo** como estándar de la casa para todos los diagramas. Se conserva la **descripción textual/ASCII** en cada archivo como fallback fiel por si el render de destino no soporta C4.

**Alternativas consideradas.**
- *Seguir con `flowchart`:* renderiza en todos lados, pero falsea la semántica C4 (distingue Person/System/Container/Component solo con color). Con una skill que estandariza C4, la consistencia y la corrección semántica pesan más que el margen de compatibilidad.

**Consecuencias.** (+) Diagramas semánticamente correctos, consistentes con el estándar del equipo, y ahora completos (se agregaron componentes, deployment y dinámico). (−) Riesgo de render en herramientas viejas → mitigado con el fallback textual en cada archivo.

---

## ADR-008 — Idempotencia con key provista por el cliente

**Estado:** Aceptada (fase de análisis) — surge de validar contra la skill `ledger-accounting-validator`

**Contexto.** El análisis inicial **no** contemplaba idempotencia. Un cliente que sufre un timeout de red y reintenta un `POST /transfers` duplicaría la transferencia — el bug de dinero más común. La skill lo marca como requisito de dominio, no optimización.

**Decisión.** `POST /transfers` exige un header **`Idempotency-Key` generado por el cliente**. Dedup vía tabla `idempotency_keys` (`DATA_MODEL.md` §5), dentro de la misma transacción DB de la transferencia. Reintento con misma key + mismos params → devuelve el resultado original; misma key + params distintos → `IDEMPOTENCY_KEY_CONFLICT`.

**Alternativas consideradas.**
- *Key generada por el server:* inútil — un timeout+reintento produce otra key y la protección no aplica. Descartada (la skill lo señala explícito).
- *Sin idempotencia:* inaceptable en un sistema que mueve dinero.

**Consecuencias.** (+) Reintentos seguros, sin duplicación. (−) El cliente debe generar y enviar la key (contrato de API más estricto); se documenta en el README.

---

## ADR-009 — Cuenta de sistema `COMPLIANCE_HOLD` y ledger con monto firmado

**Estado:** Aceptada (fase de análisis) — **corrige** el modelo previo de hold

**Contexto.** El modelo inicial describía el hold como "débito sobre el saldo del emisor **sin** crédito al receptor". Eso **viola la doble entrada**: un débito sin contraparte rompe la conservación (`sum(débitos) ≠ sum(créditos)`). El `balance_kind (AVAILABLE/LEDGER)` que se había inventado era un parche que fingía la doble entrada.

**Decisión.** Introducir **cuentas de sistema** (`COMPLIANCE_HOLD`, `SYSTEM_FUNDING`) y modelar `ledger_entries.amount` **con signo** (`+` crédito / `−` débito). Cada operación es un journal que suma cero: el hold hace `USER_A −m / COMPLIANCE_HOLD +m`. El dinero retenido vive en una cuenta real, no en la nada. Se elimina `balance_kind`.

**Alternativas consideradas.**
- *`balance_kind` con dos proyecciones por usuario:* no es doble entrada real; no pasa el invariante #3 (journal balanceado). Descartada.
- *Dos filas débito/crédito con columna `direction`:* equivalente, pero el monto firmado hace trivial el chequeo `GROUP BY transaction_id HAVING SUM(amount) <> 0`.

**Consecuencias.** (+) Doble entrada correcta, conservación verificable, "disponible vs pendiente" derivado limpio. (−) Más cuentas que razonar (las de sistema); `SYSTEM_FUNDING` va negativa por diseño (es la fuente externa/equity).

---

## ADR-010 — Hash de password con `bcryptjs`

**Estado:** Aceptada (Slice 1) — reversible

**Contexto.** El registro debe guardar la password hasheada. Las opciones: `bcrypt` (nativo, más rápido), `bcryptjs` (JS puro), `argon2` (más fuerte, recomendado por OWASP, nativo).

**Decisión.** Usar **`bcryptjs`**: JS puro, sin dependencias nativas → instala sin toolchain de compilación en `node:22-alpine` (el `bcrypt` nativo exigiría `python/make/g++` en el Dockerfile). Cost factor 10.

**Alternativas consideradas.**
- *`bcrypt` nativo:* más rápido, pero complica el Dockerfile alpine (build tools). Descartada por costo/beneficio en este alcance.
- *`argon2`:* algoritmo superior, pero también nativo (mismo problema de build) y over-kill para la prueba. Candidato #1 si esto fuera producción real.

**Consecuencias.** (+) Dockerfile simple, sin build nativo, portable. (−) `bcryptjs` es más lento que el nativo (irrelevante a esta escala). Migrar a argon2 es acotado: cambia solo `AuthService`.

---

## ADR-011 — JWT con `passport-jwt` (estrategia) y no verificación manual

**Estado:** Aceptada (Slice 1)

**Contexto.** Hay que validar el `Bearer <token>` en rutas protegidas. Se puede verificar el token a mano con `JwtService.verify` en un guard propio, o usar el patrón estándar de Passport.

**Decisión.** Usar **`@nestjs/passport` + `passport-jwt`**: una `JwtStrategy` extrae y valida el token; un `JwtAuthGuard` (`AuthGuard('jwt')`) lo aplica. `validate()` deja `{ userId, email }` en `request.user`.

**Alternativas consideradas.**
- *Guard manual con `JwtService.verify`:* menos dependencias, pero reinventa lo que Passport ya resuelve (extracción, expiración, 401 consistente). Descartada por no aportar valor.

**Consecuencias.** (+) Patrón idiomático de NestJS, esperado en un review; separación limpia estrategia/guard. (−) Un par de deps más (`passport`, `passport-jwt`).

---

## ADR-012 — Tabla `journals` como agrupador contable (reemplaza `ledger_entries.transaction_id`)

**Estado:** Aceptada (Slice 2) — refina `DATA_MODEL.md`

**Contexto.** El modelo previo agrupaba asientos por `ledger_entries.transaction_id`. Pero no todo movimiento es una transferencia: el **saldo semilla** (S1) no tiene emisor/receptor ni fila en `transactions`. El invariante #3 ("cada journal suma cero") necesita un agrupador que exista para *todos* los eventos contables, no solo transferencias.

**Decisión.** Introducir la tabla **`journals`** (cada journal = un evento contable balanceado, con un `kind`). `ledger_entries` referencia `journal_id`. `journals.transaction_id` es nullable y enlaza con una transferencia cuando aplica (NULL para `SEED`); la FK a `transactions` se agrega en el Slice 3.

**Alternativas consideradas.**
- *`transaction_id` nullable en `ledger_entries`:* los asientos de seed quedarían con NULL y no se pueden agrupar para el invariante #3. Descartada.
- *Representar el seed como una `transaction`:* no encaja — `transactions` exige `sender_id`/`receiver_id` NOT NULL y `sender <> receiver`. Descartada.

**Consecuencias.** (+) Invariante #3 verificable sobre cualquier evento; separación limpia entre "evento contable" (journal) y "transferencia de negocio" (transaction). (−) Una tabla más y un join extra al reconstruir el historial de una transferencia.

---

## ADR-013 — Registro provisiona cuenta + seed en una sola transacción

**Estado:** Aceptada (Slice 2)

**Contexto.** Al registrarse, un usuario necesita una cuenta `USER` con su saldo semilla. Si el usuario se creara sin cuenta (o sin seed), quedaría en un estado inconsistente.

**Decisión.** `AuthService.register` envuelve en **una transacción DB** (`dataSource.transaction`): crear `users` + crear cuenta `USER` + postear el journal `SEED`. Todo commitea junto o nada. El seed pasa por `LedgerService.postJournal` como cualquier otro movimiento (nunca `UPDATE` directo).

**Alternativas consideradas.**
- *Provisionar la cuenta en una tx separada del `users`:* más simple pero deja una ventana de inconsistencia (usuario sin cuenta) si falla el segundo paso. Descartada por el énfasis del proyecto en atomicidad.

**Consecuencias.** (+) Un usuario siempre nace con cuenta y saldo, atómicamente. (−) `AuthService` conoce `LedgerService` y orquesta una transacción — acoplamiento aceptable y explícito.

---

## ADR-014 — Idempotencia con `INSERT ... ON CONFLICT DO NOTHING`, no try/catch

**Estado:** Aceptada (Slice 3) — corrige un bug encontrado en el review

**Contexto.** La primera implementación de la idempotencia hacía `INSERT` de la key y **atrapaba** la violación de unicidad para hacer el replay. Falla en Postgres: cuando un statement viola un constraint **dentro de una transacción**, Postgres **aborta toda la transacción** (`25P02 in_failed_sql_transaction`); cualquier query posterior (el `findOne` del replay) revienta con `500`. Se detectó porque el 2º request con la misma key devolvía `500`.

**Decisión.** Reclamar la key con **`INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING`**. No lanza excepción (no envenena la transacción). Si devuelve una fila → es fresca; si devuelve cero → ya existía → replay (mismos params) o `IDEMPOTENCY_KEY_CONFLICT`. Además maneja la **concurrencia**: un duplicado concurrente se bloquea en el `ON CONFLICT` hasta que la otra transacción commitea/rollbackea.

**Alternativas consideradas.**
- *try/catch de la unique violation:* rompe por el aborto de transacción de Postgres. Descartada (era el bug).
- *`SAVEPOINT` alrededor del INSERT:* funciona, pero `ON CONFLICT` es más simple y expresa la intención directamente.

**Consecuencias.** (+) Idempotencia correcta y concurrency-safe, sin envenenar la tx. (−) SQL crudo en vez de la API del repositorio, justificado por el control fino que requiere el path crítico (coherente con ADR-004).

**Nota (review holístico):** la key se **scopea por usuario** — PK compuesto `(user_id, idempotency_key)` y `request_hash` que incluye el `sender_id`. Sin esto, la key era global y el reuso del mismo valor por dos usuarios podía cruzar transferencias. Corregido en la migración `ScopeIdempotencyPerUser` con test cross-user.

---

## ADR-015 — Autorización de admin vía `role` en el JWT + bootstrap por env

**Estado:** Aceptada (Slice 4)

**Contexto.** Los endpoints de compliance (aprobar/rechazar) deben ser solo para administradores. Hace falta (a) un modelo de rol y (b) al menos un admin existente.

**Decisión.** Columna `users.role` (`USER`|`ADMIN`); el JWT incluye `role`; un `AdminGuard` (aplicado tras `JwtAuthGuard`) rechaza no-admins con `403`. Un admin se crea al arranque (`AdminBootstrapService`, `OnApplicationBootstrap`) desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`, idempotente.

**Alternativas consideradas.**
- *RBAC completo (roles/permline tables):* over-kill para el alcance; un rol binario alcanza.
- *Admin sembrado en una migración:* requeriría bcrypt dentro de la migración (feo). El bootstrap al arranque hashea con la misma lógica de la app.

**Consecuencias.** (+) Autorización simple, estándar y testeada (403 para no-admin). El admin no tiene cuenta de ledger (no transfiere). (−) Rol en el token → cambiar el rol de un usuario requiere re-login (aceptable en este alcance).

---

## Nota de diseño — `APPROVED` como transición auditada, estado final `SETTLED`

La máquina de estados separa `APPROVED` de `SETTLED` (regla del proyecto: decisión de compliance ≠ liquidación). En la implementación, aprobar registra **dos** filas de auditoría (`PENDING_REVIEW→APPROVED` y `APPROVED→SETTLED`) dentro de una sola transacción DB; el estado **persistido** final es `SETTLED`. `APPROVED` existe como paso lógico auditado, no como estado terminal huérfano. La separación settle-automático / hold-compliance se respetó en métodos/servicios distintos (`TransfersService.settleImmediately` vs. `ComplianceService`).

---

## Nota sobre uso de IA (se amplía en AI_USAGE.md)

Los documentos de análisis (CONTEXT, DOMAIN_SPEC, diagramas, TEST_PLAN, este ADR) fueron **redactados con asistencia de IA a partir del enunciado y del modelo de dominio ya fijado en `CLAUDE.md`**. Validación: revisión manual de cada supuesto contra el texto del enunciado, verificación de que no se inventaron requisitos ni se relajaron los existentes, y coherencia cruzada entre documentos. El detalle por artefacto se registra en `AI_USAGE.md` durante el build.
