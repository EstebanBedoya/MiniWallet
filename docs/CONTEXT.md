# CONTEXT — MiniWallet

Documento de encuadre. Define **quién** usa el sistema, **hasta dónde llega** esta versión y **qué supuestos** tomamos donde el enunciado deja margen. No describe el "cómo" técnico (eso vive en `DOMAIN_SPEC.md` y `DIAGRAMS/`).

## 1. Actores del sistema

| Actor | Tipo | Interacción con MiniWallet |
|---|---|---|
| **Usuario registrado** | Humano (app móvil/web) | Se registra, se autentica (JWT), transfiere saldo a otro usuario, consulta su historial paginado. Es el emisor y/o receptor de una transferencia. |
| **Administrador / Compliance** | Humano | Consulta el endpoint de "transacciones sospechosas". En esta versión **también** representa a quien aprueba o rechaza manualmente las transacciones en `PENDING_REVIEW` (ver supuesto S3). |
| **Sistema (motor de settlement)** | Automático interno | No es un actor externo, pero dispara transiciones de estado: liquida (`SETTLED`) las transferencias que no requieren revisión, y registra cada operación en auditoría. Se modela explícito porque *dispara transiciones de la máquina de estados sin intervención humana*. |
| **Base de datos transaccional** | Sistema interno | Garante de atomicidad e invariante contable. No es actor de negocio pero es el punto donde "no se pierde ni duplica dinero" se vuelve real. |

> **Nota sobre "compliance externo":** el enunciado menciona "políticas de cumplimiento" pero **no** describe un tercero (proveedor KYC/AML externo, screening automático). Ver supuesto **S2**: en esta versión el proceso de validación es **interno y manual**, no una integración con un sistema externo. Se diseña la frontera para poder enchufarlo después (ver `DECISIONS.md`).

## 2. Alcance

### Incluye (in scope)
- Registro y autenticación de usuarios con **JWT**.
- Transferencia de saldo entre dos usuarios, **atómica** (nunca pierde ni duplica dinero).
- Modelo de **doble estado de saldo**: disponible vs. contable/pendiente.
- Máquina de estados de transacción con el **hold de compliance** para montos ≥ $1000 USD.
- Historial de transacciones **paginado** por usuario.
- Endpoint administrativo de **transacciones sospechosas** (criterios definidos en `DOMAIN_SPEC.md`).
- **Auditoría** trazable de toda operación financiera.
- **Errores semánticos** con códigos de negocio propios (no solo HTTP).
- Despliegue con **un solo comando** (`docker compose up`).
- Al menos **un test de integración** sobre el flujo de transferencia.

### NO incluye (out of scope — explícito)
- **Dinero real / rails de pago.** No hay integración con bancos, tarjetas, ACH, ni entrada/salida de fondos (cash-in / cash-out). El saldo es un número interno; su origen inicial es un supuesto (ver S1).
- **Multi-moneda / FX.** Todo es USD. El "$1,000 USD" se trata como una unidad monetaria única (ver S4 sobre representación).
- **Screening AML/KYC automático real.** La "detección de sospechosas" es una consulta con criterios heurísticos definidos, no un motor de riesgo con ML ni listas de sanciones.
- **Reversas / chargebacks / disputas.** Una vez `SETTLED`, no se modela reversión en esta versión.
- **Gestión de roles fina / panel de administración.** El endpoint admin se protege, pero no se construye un sistema de RBAC completo ni UI de administración.
- **Notificaciones** (push/email) al usuario o al equipo de compliance.
- **Frontend.** La entrega es backend + API; "app móvil o web" queda como consumidor teórico del API.
- **Alta disponibilidad / multi-región / réplicas.** Un solo nodo de API y una sola DB. El "cómo escalaría" se documenta pero no se implementa.

## 3. Supuestos (donde el enunciado es ambiguo)

Se listan explícitos, no escondidos en el diseño. Cada uno indica **por qué** existe la ambigüedad y **qué decidimos**.

| # | Ambigüedad en el enunciado | Supuesto que tomamos |
|---|---|---|
| **S1** | No dice de dónde sale el saldo inicial de un usuario ni si existe cash-in. | Cada usuario arranca con un **saldo inicial semilla** (ej. otorgado al registrarse o vía seed) para poder ejercitar transferencias. No se modela ingreso de fondos externo. Este saldo semilla se registra como un asiento de ledger, no como un `UPDATE` directo. |
| **S2** | "Proceso de validación por cumplimiento" — no especifica si es automático, externo, o manual. | El proceso es **interno y manual**: la transacción queda en `PENDING_REVIEW` y un administrador la aprueba/rechaza. Se deja la frontera lista para reemplazar el paso manual por un servicio externo sin cambiar la máquina de estados. |
| **S3** | No define **quién** aprueba las transacciones ≥ $1000 ni con qué endpoint. | El **administrador** las aprueba/rechaza mediante un endpoint administrativo (además del de "sospechosas"). Reusa el mismo actor Administrador/Compliance. |
| **S4** | No especifica cómo representar dinero (float, decimal, centavos). | Se usa **`NUMERIC(20,2)`** en DB, **nunca float** ni el tipo `money`, para aritmética decimal exacta (ver `DATA_MODEL.md` §1 y `DECISIONS.md` ADR-006). El umbral es `1000.00`. |
| **S5** | "Inmediatamente" para transferencias < $1000: ¿inmediato para emisor y receptor por igual? | Para montos **< $1000**: impacto inmediato en el saldo disponible de **ambos** (débito al emisor, crédito al receptor), va directo a `SETTLED`. |
| **S6** | Para ≥ $1000: no aclara qué pasa con el saldo del **emisor** mientras se valida. | Se descuenta el `balance_available` del **emisor al instante** (para evitar doble gasto durante la revisión), pero **no** se acredita al receptor hasta `APPROVED`. Si se rechaza, se revierte el hold al emisor vía asiento inverso. Ver `DOMAIN_SPEC.md` §T1. |
| **S7** | El umbral $1000: ¿"mayor a" (`> 1000`) estricto o `>= 1000`? | El enunciado dice "mayor a $1,000". Se interpreta **`>= $1000`** por prudencia de compliance (un monto de exactamente $1000 es material y conviene revisarlo). **Se documenta como decisión reversible** — cambiar a `> 1000` es un one-liner. Ver `DECISIONS.md`. |
| **S8** | "Transacciones sospechosas": el enunciado pide *definirlas*. | Se definen con criterios heurísticos concretos y justificados en `DOMAIN_SPEC.md` §4. No pretende ser un motor AML real. |
| **S9** | Concurrencia: "múltiples usuarios simultáneos" — no define nivel de aislamiento esperado. | Se garantiza que **dos transferencias concurrentes sobre el mismo emisor no puedan sobregirar** el saldo, vía bloqueo pesimista de fila / control de concurrencia a nivel DB dentro de una transacción. Ver `DOMAIN_SPEC.md` §5. |
| **S10** | Autenticación: no define expiración de token, refresh, revocación. | JWT de acceso con expiración corta; **sin** refresh token ni revocación en esta versión (out of scope). |

> Cualquier cambio a estos supuestos que toque el modelo de dominio **obliga a actualizar `DOMAIN_SPEC.md`** (regla del proyecto).
