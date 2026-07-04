import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  // Composite PK: the key is scoped per user, so two users can independently
  // use the same Idempotency-Key value (DOMAIN_SPEC §8).
  @PrimaryColumn({ type: 'bigint', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'text', name: 'idempotency_key' })
  idempotencyKey: string;

  // Hash of the request params — detects reuse of a key with a different body.
  @Column({ type: 'text', name: 'request_hash' })
  requestHash: string;

  @Column({ type: 'bigint', name: 'transaction_id', nullable: true })
  transactionId: string | null;

  @Column({ type: 'text', name: 'response_status', nullable: true })
  responseStatus: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
