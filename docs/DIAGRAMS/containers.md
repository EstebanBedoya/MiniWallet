# Diagrama de Contenedores (C4 nivel 2)

Abre la caja negra de MiniWallet. Cada contenedor: **nombre · tecnología · responsabilidad**. Cada flecha: **protocolo · propósito**.

## Descripción textual (referencia)

```
  Usuario (app móvil/web)              Administrador / Compliance
        │                                     │
        │ HTTPS/JSON (REST)                   │ HTTPS/JSON (REST, endpoints admin)
        ▼                                     ▼
  ┌─────────────────────────────────────────────────────────┐
  │  API MiniWallet                                          │
  │  NestJS (Node.js + TypeScript)                           │
  │  - Auth JWT, transferencias, historial, admin           │
  │  - Máquina de estados + validación de invariantes       │
  └───────────────┬─────────────────────────────────────────┘
                  │ TCP/SQL (TypeORM) — transacciones ACID,
                  │ bloqueo pesimista de fila, asientos de ledger
                  ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Base de datos transaccional                            │
  │  PostgreSQL                                             │
  │  - users, ledger (append-only), transactions,          │
  │    audit_log                                           │
  │  - Garante de atomicidad e invariante contable         │
  └─────────────────────────────────────────────────────────┘

  Todo orquestado por Docker Compose (un solo comando: `docker compose up`).
```

## Código Mermaid (C4 — nivel 2: Contenedores)

```mermaid
C4Container
  title Diagrama de Contenedores - MiniWallet

  Person(user, "Usuario", "App móvil/web")
  Person(admin, "Administrador / Compliance", "Revisión de compliance")

  Container_Boundary(sys, "MiniWallet") {
    Container(api, "API MiniWallet", "NestJS (Node.js + TypeScript)", "Auth JWT, transferencias, historial, admin. Máquina de estados + invariantes contables")
    ContainerDb(db, "Base de datos transaccional", "PostgreSQL", "users, accounts, ledger_entries (append-only), transactions, audit_log")
  }

  Rel(user, api, "Login, transferir, historial", "HTTPS/JSON")
  Rel(admin, api, "Sospechosas, aprobar/rechazar", "HTTPS/JSON")
  Rel(api, db, "tx ACID, SELECT … FOR UPDATE, asientos de ledger + auditoría", "TCP/SQL (TypeORM)")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

> Todo orquestado por Docker Compose (`docker compose up`). La topología de despliegue está en `deployment.md`; el detalle interno de la API en `components.md`.

## Contenedores

| Contenedor | Tecnología | Responsabilidad principal |
|---|---|---|
| **API MiniWallet** | NestJS (Node.js + TypeScript) | Expone el API REST. Autentica con JWT. Ejecuta la lógica de transferencia (máquina de estados, hold de compliance, validación de saldo), historial paginado y endpoints admin. Traduce errores de dominio a códigos semánticos. |
| **Base de datos transaccional** | PostgreSQL | Persiste `users`, `ledger` (asientos inmutables), `transactions` (estado) y `audit_log`. Garantiza atomicidad (transacciones ACID) y sirve el bloqueo pesimista que evita sobregiros bajo concurrencia. |
| **Orquestador** | Docker Compose | Levanta API + DB con un comando. No es un contenedor de negocio; es la restricción técnica del enunciado (despliegue reproducible). |

## Flechas (interacciones)

| Origen → Destino | Protocolo | Propósito |
|---|---|---|
| Usuario → API MiniWallet | HTTPS / JSON (REST) | Login, transferir, consultar historial. Autenticado con JWT en header. |
| Administrador → API MiniWallet | HTTPS / JSON (REST) | Consultar sospechosas, aprobar/rechazar retenidas. Endpoints admin protegidos. |
| API MiniWallet → PostgreSQL | TCP / SQL (vía TypeORM) | Leer/escribir dentro de transacciones ACID; tomar bloqueo pesimista de la fila del emisor; escribir asientos de ledger y auditoría. |

## Justificación de la tecnología (por qué cada elección)

| Elección | Justificación (1–2 líneas) |
|---|---|
| **NestJS** | Framework opinado sobre Node/TS: DI, capas y módulos que empujan a una arquitectura limpia y testeable — clave cuando el 25% de la nota es calidad de código y hay lógica transaccional que aislar. Soporte de primera para interceptores/filtros → manejo de errores semánticos centralizado. |
| **PostgreSQL** | El requisito duro es "nunca perder ni duplicar dinero" bajo concurrencia. Postgres da transacciones ACID serias, `SELECT … FOR UPDATE` para el bloqueo pesimista, y `NUMERIC` exacto para dinero. Una base NoSQL no daría estas garantías sin reimplementarlas a mano. |
| **TypeORM** | ORM nativo del ecosistema Nest; permite manejar transacciones y locks pesimistas de forma explícita sin perder control del SQL crítico. El trade-off (ORM vs. SQL crudo) se documenta en `DECISIONS.md`. |
| **Docker Compose** | Lo exige el enunciado: sistema completo con un solo comando. Reproducibilidad del entorno API+DB sin pasos manuales. |

> Nota de escalabilidad (detalle en `README.md` → "Cómo escalaría"): este diseño es un solo nodo de API + una DB. El camino de escala es API stateless replicable detrás de un balanceador, y en la DB pasar de lock pesimista a particionamiento/sharding por cuenta o a colas para el flujo de compliance. No se implementa en esta versión.
