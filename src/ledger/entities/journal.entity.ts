import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type JournalKind =
  | 'SEED'
  | 'TRANSFER_SETTLE'
  | 'TRANSFER_HOLD'
  | 'HOLD_RELEASE'
  | 'HOLD_REFUND';

/** A journal groups the ledger entries of one balanced accounting event. */
@Entity('journals')
export class Journal {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'journal_id' })
  journalId: string;

  @Column({ type: 'text' })
  kind: JournalKind;

  // Links to a transfer when applicable; NULL for SEED. FK added in Slice 3.
  @Column({ type: 'bigint', name: 'transaction_id', nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
