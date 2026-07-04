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
flowchart TB
    user["👤 Usuario"]
    admin["👤 Admin/Compliance"]

    subgraph api["API MiniWallet (NestJS)"]
        auth["<b>AuthModule</b><br/><i>registro, login, guards JWT</i>"]
        transfers["<b>TransfersModule</b><br/><i>orquesta transferencia,<br/>decide ruta por umbral, historial</i>"]
        compliance["<b>ComplianceModule</b><br/><i>hold, aprobar/rechazar,<br/>detección de sospechosas</i>"]
        ledger["<b>LedgerModule</b><br/><i>asientos doble entrada,<br/>saldos, FOR UPDATE</i>"]
        audit["<b>AuditModule</b><br/><i>registro de auditoría</i>"]
    end
    db[("<b>PostgreSQL</b><br/><i>accounts · ledger_entries<br/>transactions · audit_log</i>")]

    user -- "registro/login, transferir, historial" --> auth
    user --> transfers
    admin -- "sospechosas, aprobar/rechazar" --> compliance
    transfers -- "hold >= $1000" --> compliance
    transfers -- "debita/acredita SOLO vía ledger" --> ledger
    compliance -- "hold/reverso/settlement SOLO vía ledger" --> ledger
    transfers -- "registra" --> audit
    compliance -- "registra transición" --> audit
    ledger -- "asientos + saldos (tx ACID) [SQL]" --> db
    transfers -- "historial paginado [SQL]" --> db

    classDef mod fill:#1f6feb,stroke:#0b3d91,color:#fff;
    classDef store fill:#2ea043,stroke:#125c26,color:#fff;
    classDef actor fill:#e8edf5,stroke:#556,color:#111;
    class auth,transfers,compliance,ledger,audit mod;
    class db store;
    class user,admin actor;
```

> Punto clave para el review: **tanto `TransfersModule` como `ComplianceModule` escriben dinero SOLO a través de `LedgerModule`**. No hay dos caminos de escritura al saldo. La separación de responsabilidades no rompe la única-puerta-al-dinero.
