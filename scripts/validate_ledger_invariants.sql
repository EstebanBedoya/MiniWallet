-- Validador de invariantes contables (DOMAIN_SPEC §7).
-- Corre estas 4 comprobaciones; cada una debe devolver 'PASS'.
-- Uso: docker compose exec -T db psql -U miniwallet -d miniwallet -f - < scripts/validate_ledger_invariants.sql

-- Invariante #1a: conservación en el ledger (todos los asientos suman cero).
SELECT 'INV#1a ledger sum zero' AS check,
       CASE WHEN COALESCE(SUM(amount), 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM ledger_entries;

-- Invariante #1b: conservación en las cuentas (todos los balances suman cero).
SELECT 'INV#1b accounts sum zero' AS check,
       CASE WHEN COALESCE(SUM(balance), 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM accounts;

-- Invariante #2: ninguna cuenta USER/COMPLIANCE_HOLD negativa.
SELECT 'INV#2 no negative user/hold' AS check,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM accounts
WHERE account_type IN ('USER', 'COMPLIANCE_HOLD') AND balance < 0;

-- Invariante #3: cada journal balancea individualmente.
SELECT 'INV#3 each journal balances' AS check,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT journal_id FROM ledger_entries GROUP BY journal_id HAVING SUM(amount) <> 0
) broken;

-- Invariante #4: el balance cacheado coincide con la reconstrucción desde el ledger.
SELECT 'INV#4 cached balance == ledger' AS check,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT a.account_id
  FROM accounts a
  LEFT JOIN (
    SELECT account_id, SUM(amount) AS ledger_balance
    FROM ledger_entries GROUP BY account_id
  ) l ON l.account_id = a.account_id
  WHERE a.balance <> COALESCE(l.ledger_balance, 0)
) drift;
