# Diagrama Dinámico — Transferencia ≥ $1000 (C4Dynamic)

Muestra el flujo numerado de la **tensión central T1** (`DOMAIN_SPEC.md` §1): reflejo inmediato en el emisor + retención por compliance. Es el escenario que más se evalúa.

## Diagrama (Mermaid — secuencia)

```mermaid
sequenceDiagram
    actor Sender as Emisor
    participant T as TransfersModule
    participant C as ComplianceModule
    participant L as LedgerModule
    participant DB as PostgreSQL
    actor Admin as Admin/Compliance

    Sender->>T: 1. POST /transfers + Idempotency-Key (monto >= 1000)
    T->>C: 2. delega hold (dedup key + valida)
    C->>L: 3. postJournal(TRANSFER_HOLD)
    L->>DB: lock emisor (FOR UPDATE), USER_A −m / COMPLIANCE_HOLD +m, tx=PENDING_REVIEW
    T-->>Sender: 4. 202 TRANSACTION_PENDING_REVIEW
    Note over Sender,DB: El emisor ya fue descontado; el receptor NO recibió nada (dinero en HOLD)
    Admin->>C: 5. POST /admin/transactions/:id/approve
    C->>L: 6. postJournal(HOLD_RELEASE)
    L->>DB: 7. COMPLIANCE_HOLD −m / USER_B +m, tx=APPROVED → SETTLED
    C-->>Admin: 200 SETTLED
```

## Lectura del flujo

1. El emisor pide transferir un monto ≥ $1000, con `Idempotency-Key` (un reintento no duplica).
2–3. En **una** transacción DB: se deduplica la key, se bloquea la cuenta del emisor, se valida saldo, y el journal mueve el dinero de `USER_A` a la cuenta de sistema `COMPLIANCE_HOLD` (`−m`/`+m`, suma cero) → el `balance_available` del emisor baja al instante (evita doble gasto) y la transacción queda `PENDING_REVIEW`. **El receptor todavía NO ve el dinero; está en HOLD, no perdido.**
4. Respuesta inmediata con código semántico `TRANSACTION_PENDING_REVIEW`.
5–7. Cuando compliance **aprueba**, se acredita al receptor y la transacción pasa `APPROVED → SETTLED`. Si **rechaza**, un asiento inverso devuelve el hold al emisor (camino no dibujado, ver máquina de estados).

> Contraste con el flujo < $1000: ahí los pasos 2–3 acreditan al receptor en el acto y la transacción va directo a `SETTLED`, sin pasos 5–7.
