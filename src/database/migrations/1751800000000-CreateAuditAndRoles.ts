import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditAndRoles1751800000000 implements MigrationInterface {
  name = 'CreateAuditAndRoles1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER'
        CHECK ("role" IN ('USER','ADMIN'))`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "audit_id"       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "actor_user_id"  BIGINT REFERENCES "users"("user_id"),
        "action"         TEXT NOT NULL,
        "transaction_id" BIGINT REFERENCES "transactions"("transaction_id"),
        "previous_state" TEXT,
        "new_state"      TEXT,
        "metadata"       JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof("metadata") = 'object'),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "audit_tx_idx" ON "audit_log" ("transaction_id")`);
    await queryRunner.query(`CREATE INDEX "audit_actor_idx" ON "audit_log" ("actor_user_id")`);
    await queryRunner.query(
      `CREATE INDEX "audit_action_created_idx" ON "audit_log" ("action", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
