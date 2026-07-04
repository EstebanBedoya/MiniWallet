import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scope idempotency keys per user: the key alone was a global PK, letting one
 * user's key collide with another's. Move to a composite PK (user_id, key).
 * See code-review finding #1 / DOMAIN_SPEC §8.
 */
export class ScopeIdempotencyPerUser1751900000000 implements MigrationInterface {
  name = 'ScopeIdempotencyPerUser1751900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD PRIMARY KEY ("user_id", "idempotency_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD PRIMARY KEY ("idempotency_key")`,
    );
  }
}
