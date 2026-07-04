import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Append-only trail of every financial operation and state transition. */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'audit_id' })
  auditId: string;

  @Column({ type: 'bigint', name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'bigint', name: 'transaction_id', nullable: true })
  transactionId: string | null;

  @Column({ type: 'text', name: 'previous_state', nullable: true })
  previousState: string | null;

  @Column({ type: 'text', name: 'new_state', nullable: true })
  newState: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
