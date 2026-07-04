import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedger1751600000000 implements MigrationInterface {
  name = 'CreateLedger1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "account_id"   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "account_type" TEXT NOT NULL CHECK ("account_type" IN ('USER','COMPLIANCE_HOLD','SYSTEM_FUNDING')),
        "user_id"      BIGINT REFERENCES "users"("user_id"),
        "balance"      NUMERIC(20,2) NOT NULL DEFAULT 0,
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "balance_non_negative" CHECK ("balance" >= 0 OR "account_type" = 'SYSTEM_FUNDING')
      )
    `);
    // One USER account per user; system accounts have NULL user_id.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "accounts_user_uq" ON "accounts" ("user_id") WHERE "user_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "journals" (
        "journal_id"     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "kind"           TEXT NOT NULL CHECK ("kind" IN
                           ('SEED','TRANSFER_SETTLE','TRANSFER_HOLD','HOLD_RELEASE','HOLD_REFUND')),
        "transaction_id" BIGINT,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "journals_tx_idx" ON "journals" ("transaction_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "entry_id"   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "journal_id" BIGINT NOT NULL REFERENCES "journals"("journal_id"),
        "account_id" BIGINT NOT NULL REFERENCES "accounts"("account_id"),
        "amount"     NUMERIC(20,2) NOT NULL CHECK ("amount" <> 0),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ledger_journal_idx" ON "ledger_entries" ("journal_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ledger_account_idx" ON "ledger_entries" ("account_id")`,
    );

    // Bootstrap the two system accounts (one-time).
    await queryRunner.query(
      `INSERT INTO "accounts" ("account_type", "user_id", "balance") VALUES
        ('COMPLIANCE_HOLD', NULL, 0),
        ('SYSTEM_FUNDING', NULL, 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TABLE "journals"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
