# Diagrama de Contexto (C4 nivel 1)

Sistema como **caja negra**: actores externos y qué entra/sale. No muestra tecnología interna (eso es el diagrama de contenedores).

## Descripción textual (referencia)

```
        ┌──────────────────────────┐
        │   Usuario registrado     │
        │  (app móvil o web)       │
        └───────────┬──────────────┘
                    │  (1) Registro / login (JWT)
                    │  (2) Transferir saldo
                    │  (3) Consultar historial paginado
                    ▼
        ┌──────────────────────────────────────────┐
        │                                          │
        │            MiniWallet (SUT)              │
        │   Servicio de transferencias entre       │
        │   usuarios + saldo + auditoría           │
        │                                          │
        └───────────▲──────────────────────────────┘
                    │  (4) Consultar transacciones sospechosas
                    │  (5) Aprobar / rechazar transacción ≥ $1000
        ┌───────────┴──────────────┐
        │  Administrador /         │
        │  Compliance              │
        └──────────────────────────┘
```

## Diagrama (Mermaid — nivel 1: Contexto C4)

```mermaid
flowchart TB
    user["👤 Usuario registrado<br/><i>(app móvil / web)</i>"]
    admin["👤 Administrador / Compliance"]
    sut(["🏦 <b>MiniWallet</b><br/>Transferencias entre usuarios,<br/>saldo y auditoría"])

    user -- "Registro/login, transferir, ver historial<br/>[HTTPS/JSON]" --> sut
    admin -- "Consultar sospechosas, aprobar/rechazar<br/>[HTTPS/JSON]" --> sut
    sut -. "Confirmación (SETTLED) o retención<br/>(PENDING_REVIEW) + código semántico" .-> user
    sut -. "Reporte de sospechosas / nuevo estado" .-> admin

    classDef sys fill:#1f6feb,stroke:#0b3d91,color:#fff;
    classDef actor fill:#e8edf5,stroke:#556,color:#111;
    class sut sys;
    class user,admin actor;
```

> **Nota de notación:** se usa `flowchart` de Mermaid (renderiza en GitHub de forma garantizada) manteniendo la semántica C4 — actores, sistema (caja negra), protocolo y propósito en cada flecha (líneas sólidas = petición, punteadas = respuesta). Ver `DECISIONS.md` ADR-007.

## Actores y flujos

| # | Actor | Entra al sistema | Sale del sistema |
|---|---|---|---|
| 1 | Usuario registrado | Credenciales de registro/login | Token JWT |
| 2 | Usuario registrado | Orden de transferencia (receptor, monto) | Confirmación (`SETTLED`) **o** aviso de retención (`PENDING_REVIEW`) + código semántico |
| 3 | Usuario registrado | Petición de historial (página, tamaño) | Lista paginada de movimientos |
| 4 | Administrador / Compliance | Petición de transacciones sospechosas (filtros) | Lista de transacciones que cumplen criterios C1–C4 |
| 5 | Administrador / Compliance | Decisión sobre una transacción retenida | Nuevo estado (`APPROVED` / `REJECTED`) + asiento contable |

## Frontera del sistema (qué NO cruza esta caja)

- **No hay proveedor de pagos / banco externo.** El saldo es interno (ver `CONTEXT.md`, S1). Por eso el diagrama de contexto **no** tiene un actor "sistema bancario" ni "gateway de pagos".
- **No hay proveedor KYC/AML externo.** La validación de compliance es interna y manual (S2). El actor "Compliance" es humano, no un sistema tercero.
- Se dibuja así **a propósito**: agregar esas cajas sería inventar requisitos que el enunciado no pide. La frontera queda lista para enchufarlos después (ver `DECISIONS.md`).
