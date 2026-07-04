import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Account } from './entities/account.entity';
import { Journal, JournalKind } from './entities/journal.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import {
  AccountNotFoundError,
  InsufficientBalanceError,
  UnbalancedJournalError,
} from './ledger.errors';
import { negate, sumCents, toCents } from './money';

/** One signed line of a journal: + credits the account, - debits it. */
export interface JournalLine {
  accountId: string;
  amount: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Post a balanced journal atomically. If `manager` is provided, runs inside
   * the caller's transaction; otherwise opens its own. This is the ONLY way
   * money moves — every write goes through here.
   */
  async postJournal(
    kind: JournalKind,
    lines: JournalLine[],
    opts: { manager?: EntityManager; transactionId?: string | null } = {},
  ): Promise<Journal> {
    if (opts.manager) {
      return this.doPostJournal(opts.manager, kind, lines, opts.transactionId);
    }
    return this.dataSource.transaction((manager) =>
      this.doPostJournal(manager, kind, lines, opts.transactionId),
    );
  }

  private async doPostJournal(
    manager: EntityManager,
    kind: JournalKind,
    lines: JournalLine[],
    transactionId: string | null = null,
  ): Promise<Journal> {
    // Invariant #3 guard, in code: the journal must balance to zero.
    if (sumCents(lines.map((l) => l.amount)) !== 0n) {
      throw new UnbalancedJournalError();
    }

    // Lock the involved accounts in a deterministic order (asc account_id) to
    // avoid deadlocks between crossing operations.
    const accountIds = [...new Set(lines.map((l) => l.accountId))].sort(
      (a, b) => (BigInt(a) < BigInt(b) ? -1 : 1),
    );
    const accounts = await manager
      .getRepository(Account)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.account_id IN (:...ids)', { ids: accountIds })
      .orderBy('a.account_id', 'ASC')
      .getMany();

    const byId = new Map(accounts.map((a) => [a.accountId, a]));

    // Pre-check non-negativity where it applies (friendly error before writing).
    for (const line of lines) {
      const account = byId.get(line.accountId);
      if (!account) throw new AccountNotFoundError();
      if (account.accountType !== 'SYSTEM_FUNDING') {
        const next = toCents(account.balance) + toCents(line.amount);
        if (next < 0n) throw new InsufficientBalanceError();
      }
    }

    const journal = await manager
      .getRepository(Journal)
      .save(manager.getRepository(Journal).create({ kind, transactionId }));

    for (const line of lines) {
      await manager.getRepository(LedgerEntry).save(
        manager.getRepository(LedgerEntry).create({
          journalId: journal.journalId,
          accountId: line.accountId,
          amount: line.amount,
        }),
      );
      // Cached balance updated via exact NUMERIC arithmetic in SQL. The DB CHECK
      // (balance >= 0 for USER/HOLD) is the last line of defense.
      await manager.query(
        'UPDATE accounts SET balance = balance + $1, updated_at = now() WHERE account_id = $2',
        [line.amount, line.accountId],
      );
    }

    return journal;
  }

  /** Create a USER account and seed it with a SEED journal. Runs in the caller's tx. */
  async provisionUserAccount(
    manager: EntityManager,
    userId: string,
    seedAmount: string,
  ): Promise<Account> {
    const account = await manager
      .getRepository(Account)
      .save(
        manager.getRepository(Account).create({
          accountType: 'USER',
          userId,
          balance: '0',
        }),
      );

    const funding = await this.getSystemAccount(manager, 'SYSTEM_FUNDING');
    await this.doPostJournal(manager, 'SEED', [
      { accountId: funding.accountId, amount: negate(seedAmount) },
      { accountId: account.accountId, amount: seedAmount },
    ]);

    return account;
  }

  getUserAccount(userId: string): Promise<Account | null> {
    return this.dataSource
      .getRepository(Account)
      .findOne({ where: { accountType: 'USER', userId } });
  }

  async getSystemAccount(
    manager: EntityManager,
    type: 'COMPLIANCE_HOLD' | 'SYSTEM_FUNDING',
  ): Promise<Account> {
    const account = await manager
      .getRepository(Account)
      .findOne({ where: { accountType: type } });
    if (!account) throw new AccountNotFoundError();
    return account;
  }
}
