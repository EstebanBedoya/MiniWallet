# Diagrama Dinámico — Transferencia ≥ $1000 (C4Dynamic)

Muestra el flujo numerado de la **tensión central T1** (`DOMAIN_SPEC.md` §1): reflejo inmediato en el emisor + retención por compliance. Es el escenario que más se evalúa.

## Código Mermaid (C4Dynamic)

```mermaid
C4Dynamic
  title Flujo - Transferencia >= $1000 (hold de compliance)

  Person(sender, "Emisor", "Inicia la transferencia")
  Person(admin, "Admin/Compliance", "Aprueba o rechaza")
  ContainerDb(db, "PostgreSQL", "TypeORM", "accounts, ledger, transactions")

  Container_Boundary(api, "API MiniWallet") {
    Component(transfers, "TransfersModule", "Nest", "Orquesta")
    Component(compliance, "ComplianceModule", "Nest", "Hold + decisión")
    Component(ledger, "LedgerModule", "Nest", "Asientos + saldos")
  }

  Rel(sender, transfers, "1. POST /transfers + Idempotency-Key (monto >= 1000)", "HTTPS/JSON")
  Rel(transfers, ledger, "2. Dedup key + lock emisor (FOR UPDATE) + valida saldo")
  Rel(ledger, db, "3. Journal USER_A -m / COMPLIANCE_HOLD +m; tx = PENDING_REVIEW", "SQL")
  Rel(transfers, sender, "4. 202 TRANSACTION_PENDING_REVIEW", "HTTPS/JSON")
  Rel(admin, compliance, "5. POST /admin/transactions/:id/approve", "HTTPS/JSON")
  Rel(compliance, ledger, "6. Journal COMPLIANCE_HOLD -m / USER_B +m; tx = APPROVED -> SETTLED")
  Rel(ledger, db, "7. Asientos de liquidación (tx ACID)", "SQL")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Lectura del flujo

1. El emisor pide transferir un monto ≥ $1000, con `Idempotency-Key` (un reintento no duplica).
2–3. En **una** transacción DB: se deduplica la key, se bloquea la cuenta del emisor, se valida saldo, y el journal mueve el dinero de `USER_A` a la cuenta de sistema `COMPLIANCE_HOLD` (`−m`/`+m`, suma cero) → el `balance_available` del emisor baja al instante (evita doble gasto) y la transacción queda `PENDING_REVIEW`. **El receptor todavía NO ve el dinero; está en HOLD, no perdido.**
4. Respuesta inmediata con código semántico `TRANSACTION_PENDING_REVIEW`.
5–7. Cuando compliance **aprueba**, se acredita al receptor y la transacción pasa `APPROVED → SETTLED`. Si **rechaza**, un asiento inverso devuelve el hold al emisor (camino no dibujado, ver máquina de estados).

> Contraste con el flujo < $1000: ahí los pasos 2–3 acreditan al receptor en el acto y la transacción va directo a `SETTLED`, sin pasos 5–7.
