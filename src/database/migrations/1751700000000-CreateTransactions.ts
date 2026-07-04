import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactions1751700000000 implements MigrationInterface {
  name = 'CreateTransactions1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "transaction_id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "sender_id"      BIGINT NOT NULL REFERENCES "users"("user_id"),
        "receiver_id"    BIGINT NOT NULL REFERENCES "users"("user_id"),
        "amount"         NUMERIC(20,2) NOT NULL,
        "status"         TEXT NOT NULL,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "amount_positive"  CHECK ("amount" > 0),
        CONSTRAINT "no_self_transfer" CHECK ("sender_id" <> "receiver_id"),
        CONSTRAINT "status_valid"     CHECK ("status" IN ('PENDING_REVIEW','APPROVED','REJECTED','SETTLED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "transactions_sender_id_idx" ON "transactions" ("sender_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "transactions_receiver_id_idx" ON "transactions" ("receiver_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "transactions_sender_created_idx" ON "transactions" ("sender_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "transactions_pending_idx" ON "transactions" ("created_at") WHERE "status" = 'PENDING_REVIEW'`,
    );

    // Now that transactions exists, wire the deferred FK from journals (ADR-012).
    await queryRunner.query(
      `ALTER TABLE "journals" ADD CONSTRAINT "journals_transaction_fk"
        FOREIGN KEY ("transaction_id") REFERENCES "transactions"("transaction_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "idempotency_key" TEXT PRIMARY KEY,
        "user_id"         BIGINT NOT NULL REFERENCES "users"("user_id"),
        "request_hash"    TEXT NOT NULL,
        "transaction_id"  BIGINT REFERENCES "transactions"("transaction_id"),
        "response_status" TEXT,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idempotency_user_idx" ON "idempotency_keys" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(
      `ALTER TABLE "journals" DROP CONSTRAINT "journals_transaction_fk"`,
    );
    await queryRunner.query(`DROP TABLE "transactions"`);
  }
}
