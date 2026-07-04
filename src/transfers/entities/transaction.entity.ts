import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TransactionStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SETTLED';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'transaction_id' })
  transactionId: string;

  @Column({ type: 'bigint', name: 'sender_id' })
  senderId: string;

  @Column({ type: 'bigint', name: 'receiver_id' })
  receiverId: string;

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount: string;

  @Column({ type: 'text' })
  status: TransactionStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
