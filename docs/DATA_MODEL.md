# DATA_MODEL — MiniWallet

Esquema PostgreSQL derivado de `DOMAIN_SPEC.md`. Sigue las skills `postgresql-table-design` (tipos/índices) y `ledger-accounting-validator` (doble entrada correcta, cuentas de sistema, idempotencia, invariantes).

Principios rectores:
1. **El saldo es una vista, no la fuente de verdad.** La verdad vive en `ledger_entries` (append-only). `accounts.balance` es una **caché recalculable**; si divergen, gana el ledger.
2. **Toda journal entry balancea a cero.** Cada transferencia genera asientos que suman cero — incluido el hold, que acredita a una **cuenta de sistema**, no a la nada.
3. **Toda operación de dinero es idempotente** desde el día uno, con key provista por el cliente.

---

## 1. Decisiones de tipo transversales

| Tema | Decisión | Por qué |
|---|---|---|
| Dinero | `NUMERIC(20,2)` | Nunca `float` ni tipo `money`. Aritmética decimal exacta (skill Postgres + ADR-006). |
| IDs | `BIGINT GENERATED ALWAYS AS IDENTITY` | Preferido sobre `serial`/`UUID` en este alcance. |
| Tiempo | `TIMESTAMPTZ` + `now()` | Instantes inequívocos para auditoría. |
| Estados | `TEXT` + `CHECK IN (...)` | Estados de negocio evolutivos → no `ENUM`. |
| Monto de asiento | `NUMERIC(20,2)` **con signo** | `+` = crédito (sube la cuenta), `−` = débito. Hace trivial el chequeo "journal suma cero". |
| FKs | Índice **manual** en cada FK | Postgres no los indexa solo. |

---

## 2. Cuentas: usuarios **y** sistema (doble entrada real)

El error que corregimos: un hold necesita una contra-cuenta. Modelamos cuentas de sistema explícitas.

| `account_type` | Dueño | No-negatividad | Rol |
|---|---|---|---|
| `USER` | un usuario | **Sí** (`>= 0`) | Saldo gastable del usuario (liability del sistema hacia él). |
| `COMPLIANCE_HOLD` | sistema | Sí (`>= 0`) | Retiene el dinero de las ≥ $1000 mientras compliance revisa. |
| `SYSTEM_FUNDING` | sistema | **No** (puede ir negativo) | Fuente externa (equity). Al sembrar saldo, se debita acá. Su balance negativo = dinero total inyectado al sistema. |

```sql
CREATE TABLE accounts (
  account_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('USER','COMPLIANCE_HOLD','SYSTEM_FUNDING')),
  user_id      BIGINT REFERENCES users(user_id),  -- NULL para cuentas de sistema
  balance      NUMERIC(20,2) NOT NULL DEFAULT 0,   -- CACHÉ recalculable desde ledger_entries
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No-negatividad solo donde aplica (USER y HOLD); FUNDING puede ser negativo:
  CONSTRAINT balance_non_negative CHECK (balance >= 0 OR account_type = 'SYSTEM_FUNDING')
);
-- Una sola cuenta USER por usuario; las de sistema tienen user_id NULL:
CREATE UNIQUE INDEX accounts_user_uq ON accounts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX accounts_user_id_idx ON accounts (user_id);
```

**Conservación como dato:** `SUM(balance)` sobre TODAS las cuentas (incluida `SYSTEM_FUNDING` negativa) es siempre `0`. Ese es el invariante #1 hecho carne.

---

## 3. `ledger_entries` — asientos inmutables (FUENTE DE VERDAD)

Append-only: sin `UPDATE`, sin `DELETE`. Monto **con signo** → un journal (todas las líneas con el mismo `transaction_id`) debe sumar `0`.

Un **journal** agrupa los asientos de un evento contable (reemplaza al viejo `transaction_id`, porque no todo movimiento es una transferencia — el seed no lo es). Ver ADR-012.

```sql
CREATE TABLE journals (
  journal_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN
                   ('SEED','TRANSFER_SETTLE','TRANSFER_HOLD','HOLD_RELEASE','HOLD_REFUND')),
  transaction_id BIGINT REFERENCES transactions(transaction_id), -- NULL para SEED; se enlaza en Slice 3
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journals_tx_idx ON journals (transaction_id); -- FK

CREATE TABLE ledger_entries (
  entry_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id  BIGINT NOT NULL REFERENCES journals(journal_id),
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id),
  amount      NUMERIC(20,2) NOT NULL CHECK (amount <> 0),  -- + credito / - debito
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_journal_idx ON ledger_entries (journal_id); -- FK
CREATE INDEX ledger_account_idx ON ledger_entries (account_id); -- FK
```

> El `transaction_id` vive en `journals` (nullable): un `SEED` no tiene transferencia; los journals de transferencia (Slice 3) lo enlazan. La FK a `transactions` se agrega en la migración del Slice 3.

**Los journals de cada flujo (todos suman cero):**

| Operación | Líneas (cuenta: monto con signo) | Efecto |
|---|---|---|
| Semilla de $S (S1) | `SYSTEM_FUNDING: −S`, `USER_A: +S` | Funding va negativo; A recibe saldo. |
| Transfer < $1000 ($m) | `USER_A: −m`, `USER_B: +m` | Directo a `SETTLED`. |
| Hold ≥ $1000 (create) | `USER_A: −m`, `COMPLIANCE_HOLD: +m` | A descontado ya; dinero en HOLD. `PENDING_REVIEW`. |
| Aprobar → settle | `COMPLIANCE_HOLD: −m`, `USER_B: +m` | HOLD libera a B. `SETTLED`. |
| Rechazar | `COMPLIANCE_HOLD: −m`, `USER_A: +m` | HOLD devuelve a A. `REJECTED`. |

> Fijate que el hold **ya no** es "un débito sin crédito": su contraparte es `COMPLIANCE_HOLD`. Doble entrada intacta, conservación intacta.

---

## 4. `transactions` — entidad con máquina de estados

```sql
CREATE TABLE transactions (
  transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id      BIGINT NOT NULL REFERENCES users(user_id),
  receiver_id    BIGINT NOT NULL REFERENCES users(user_id),
  amount         NUMERIC(20,2) NOT NULL,
  status         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT amount_positive  CHECK (amount > 0),
  CONSTRAINT no_self_transfer CHECK (sender_id <> receiver_id),
  CONSTRAINT status_valid     CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED','SETTLED'))
);
CREATE INDEX transactions_sender_id_idx   ON transactions (sender_id);   -- FK
CREATE INDEX transactions_receiver_id_idx ON transactions (receiver_id); -- FK
CREATE INDEX transactions_sender_created_idx ON transactions (sender_id, created_at DESC);
CREATE INDEX transactions_pending_idx ON transactions (created_at) WHERE status = 'PENDING_REVIEW';
```

---

## 5. `idempotency_keys` — dedup de operaciones (key del CLIENTE)

Sin esto, un reintento del cliente duplica dinero. La key la genera el **cliente** (header `Idempotency-Key`); si la generara el server, un timeout+reintento produciría otra key y la protección no serviría.

```sql
CREATE TABLE idempotency_keys (
  idempotency_key TEXT NOT NULL,                    -- provista por el cliente
  user_id         BIGINT NOT NULL REFERENCES users(user_id),
  request_hash    TEXT NOT NULL,                    -- hash de sender+params (detecta reuso con otro body)
  transaction_id  BIGINT REFERENCES transactions(transaction_id),
  response_status TEXT,                             -- estado devuelto la 1ª vez
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)            -- key scopeada por usuario (ADR-014)
);
CREATE INDEX idempotency_user_idx ON idempotency_keys (user_id);
```

> **PK compuesto `(user_id, idempotency_key)`**: la key es por-usuario. Dos usuarios pueden usar el mismo valor de key sin interferir. El `request_hash` incluye el `sender_id` para que ni siquiera con mismos params haya cruce.

**Protocolo** (dentro de la MISMA transacción de la transferencia):
1. `INSERT` de la key. Si viola el PK → la operación ya se procesó:
   - Si `request_hash` coincide → devolver el resultado guardado (misma respuesta, sin re-ejecutar).
   - Si `request_hash` difiere → error `IDEMPOTENCY_KEY_CONFLICT` (reusaron la key para otra cosa).
2. Si el `INSERT` entra limpio → ejecutar la transferencia y guardar `transaction_id`/`response_status`.

---

## 6. `audit_log` — trazabilidad (append-only)

```sql
CREATE TABLE audit_log (
  audit_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id  BIGINT REFERENCES users(user_id),   -- NULL si lo dispara el sistema
  action         TEXT NOT NULL,
  transaction_id BIGINT REFERENCES transactions(transaction_id),
  previous_state TEXT,
  new_state      TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_tx_idx    ON audit_log (transaction_id); -- FK
CREATE INDEX audit_actor_idx ON audit_log (actor_user_id);  -- FK
CREATE INDEX audit_action_created_idx ON audit_log (action, created_at DESC);
```

---

## 7. Concurrencia a nivel esquema

- La transferencia toma `SELECT … FOR UPDATE` sobre las filas de `accounts` involucradas (incluida `COMPLIANCE_HOLD` cuando participa), **ordenadas por `account_id` ascendente** → evita deadlocks en A→B / B→A simultáneas.
- `CHECK (balance >= 0 …)` en USER/HOLD = última línea de defensa contra sobregiro, aunque falle la lógica de app.
- `ledger_entries`, `audit_log`, `idempotency_keys` son insert-only → sin bloat por MVCC.

---

## 8. Índices al servicio de "sospechosas"

| Criterio | Índice |
|---|---|
| C1 monto alto | `transactions_pending_idx` (o `(amount)` para SETTLED) |
| C2 velocity | `transactions_sender_created_idx (sender_id, created_at DESC)` |
| C3 structuring | mismo compuesto (prefijo `sender_id` + rango `created_at`) |
| C4 vaciado | requiere snapshot de saldo al momento (build, ADR-005) |

El compuesto `(sender_id, created_at DESC)` sirve a la vez al historial paginado (RF3) y a C2/C3.
