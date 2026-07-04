# Diagrama de Componentes — API MiniWallet (C4 nivel 3)

Abre el contenedor **API MiniWallet** en sus módulos NestJS. Solo se documenta este nivel porque **aporta valor**: es donde se ve la separación no negociable entre "settlement automático" y "hold de compliance" (`CLAUDE.md`).

## Módulos y responsabilidades

| Componente (módulo Nest) | Responsabilidad |
|---|---|
| `AuthModule` | Registro, login, emisión y validación de JWT. Guard de autenticación. |
| `TransfersModule` | Orquesta una transferencia: valida saldo, decide ruta según umbral, delega en el ledger. **No** contiene la lógica de compliance. |
| `ComplianceModule` | Camino de estado de las ≥ $1000: hold, aprobación/rechazo (endpoints admin) y detección de sospechosas. Separado de `TransfersModule` a propósito. |
| `LedgerModule` | Única puerta de escritura al dinero: crea asientos de doble entrada y actualiza los saldos materializados dentro de la transacción DB. Toma el `FOR UPDATE`. |
| `AuditModule` | Escribe `audit_log` en cada operación/transición. |
| `HistoryModule` | Consulta paginada del historial del usuario. |

## Código Mermaid (C4Component)

```mermaid
C4Component
  title Componentes - API MiniWallet

  Person(user, "Usuario", "App móvil/web")
  Person(admin, "Admin/Compliance", "Revisión")
  ContainerDb(db, "PostgreSQL", "TypeORM", "accounts, ledger_entries, transactions, audit_log")

  Container_Boundary(api, "API MiniWallet (NestJS)") {
    Component(auth, "AuthModule", "Nest + JWT", "Registro, login, guards")
    Component(transfers, "TransfersModule", "Nest", "Orquesta transferencia, decide ruta por umbral")
    Component(compliance, "ComplianceModule", "Nest", "Hold, aprobar/rechazar, detección de sospechosas")
    Component(ledger, "LedgerModule", "Nest + TypeORM", "Asientos doble entrada, saldos, FOR UPDATE")
    Component(audit, "AuditModule", "Nest", "Registro de auditoría")
    Component(history, "HistoryModule", "Nest", "Historial paginado")
  }

  Rel(user, auth, "Registro/login", "HTTPS/JSON")
  Rel(user, transfers, "Transferir", "HTTPS/JSON")
  Rel(user, history, "Ver historial", "HTTPS/JSON")
  Rel(admin, compliance, "Sospechosas, aprobar/rechazar", "HTTPS/JSON")

  Rel(transfers, ledger, "Debita/acredita vía ledger")
  Rel(compliance, ledger, "Hold, reverso, settlement vía ledger")
  Rel(transfers, audit, "Registra operación")
  Rel(compliance, audit, "Registra transición")
  Rel(ledger, db, "Asientos + saldos (tx ACID)", "SQL")
  Rel(history, db, "Lee historial paginado", "SQL")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

> Punto clave para el review: **tanto `TransfersModule` como `ComplianceModule` escriben dinero SOLO a través de `LedgerModule`**. No hay dos caminos de escritura al saldo. La separación de responsabilidades no rompe la única-puerta-al-dinero.
