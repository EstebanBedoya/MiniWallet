import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccountType = 'USER' | 'COMPLIANCE_HOLD' | 'SYSTEM_FUNDING';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'account_id' })
  accountId: string;

  @Column({ type: 'text', name: 'account_type' })
  accountType: AccountType;

  @Column({ type: 'bigint', name: 'user_id', nullable: true })
  userId: string | null;

  // NUMERIC(20,2) surfaces as string — keep money as string end-to-end.
  @Column({ type: 'numeric', precision: 20, scale: 2 })
  balance: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
