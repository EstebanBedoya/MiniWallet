import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only. One signed line of a journal (+ credit / - debit). */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'entry_id' })
  entryId: string;

  @Column({ type: 'bigint', name: 'journal_id' })
  journalId: string;

  @Column({ type: 'bigint', name: 'account_id' })
  accountId: string;

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
