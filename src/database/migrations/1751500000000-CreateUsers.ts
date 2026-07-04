import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1751500000000 implements MigrationInterface {
  name = 'CreateUsers1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "user_id"       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "email"         TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "name"          TEXT NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Case-insensitive unique email (matches UsersService.findByEmail).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_email_lower_uq"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
