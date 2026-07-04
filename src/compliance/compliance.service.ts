import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LedgerService } from '../ledger/ledger.service';
import { AccountNotFoundError } from '../ledger/ledger.errors';
import { negate } from '../ledger/money';
import { AuditService } from '../audit/audit.service';
import { Transaction } from '../transfers/entities/transaction.entity';
import {
  TransactionAlreadyRejectedError,
  TransactionAlreadySettledError,
  TransactionNotFoundError,
  TransactionNotPendingReviewError,
} from './compliance.errors';

export interface PlaceHoldParams {
  senderUserId: string;
  senderAccountId: string;
  receiverUserId: string;
  amount: string;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Hold path (>= $1000). Debits the sender to COMPLIANCE_HOLD immediately and
   * leaves the transaction PENDING_REVIEW — the receiver is NOT credited yet.
   * Runs inside the caller's transaction.
   */
  async placeHold(
    manager: EntityManager,
    params: PlaceHoldParams,
  ): Promise<Transaction> {
    const tx = await manager.getRepository(Transaction).save(
      manager.getRepository(Transaction).create({
        senderId: params.senderUserId,
        receiverId: params.receiverUserId,
        amount: params.amount,
        status: 'PENDING_REVIEW',
      }),
    );

    const hold = await this.ledger.getSystemAccount(manager, 'COMPLIANCE_HOLD');
    await this.ledger.postJournal(
      'TRANSFER_HOLD',
      [
        { accountId: params.senderAccountId, amount: negate(params.amount) },
        { accountId: hold.accountId, amount: params.amount },
      ],
      { manager, transactionId: tx.transactionId },
    );

    await this.audit.record(manager, {
      actorUserId: params.senderUserId,
      action: 'TRANSFER_HELD',
      transactionId: tx.transactionId,
      previousState: null,
      newState: 'PENDING_REVIEW',
    });

    return tx;
  }

  /** Approve a held transaction: HOLD -> receiver, PENDING_REVIEW -> APPROVED -> SETTLED. */
  async approve(transactionId: string, adminUserId: string): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const tx = await this.lockPending(manager, transactionId);
      const receiver = await this.ledger.getUserAccount(tx.receiverId);
      if (!receiver) throw new AccountNotFoundError();
      const hold = await this.ledger.getSystemAccount(manager, 'COMPLIANCE_HOLD');

      await this.audit.record(manager, {
        actorUserId: adminUserId,
        action: 'TX_APPROVED',
        transactionId,
        previousState: 'PENDING_REVIEW',
        newState: 'APPROVED',
      });

      await this.ledger.postJournal(
        'HOLD_RELEASE',
        [
          { accountId: hold.accountId, amount: negate(tx.amount) },
          { accountId: receiver.accountId, amount: tx.amount },
        ],
        { manager, transactionId },
      );

      await manager.getRepository(Transaction).update({ transactionId }, { status: 'SETTLED' });
      await this.audit.record(manager, {
        actorUserId: adminUserId,
        action: 'TX_SETTLED',
        transactionId,
        previousState: 'APPROVED',
        newState: 'SETTLED',
      });

      return { ...tx, status: 'SETTLED' as const };
    });
  }

  /** Reject a held transaction: HOLD -> sender (refund), PENDING_REVIEW -> REJECTED. */
  async reject(transactionId: string, adminUserId: string): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const tx = await this.lockPending(manager, transactionId);
      const sender = await this.ledger.getUserAccount(tx.senderId);
      if (!sender) throw new AccountNotFoundError();
      const hold = await this.ledger.getSystemAccount(manager, 'COMPLIANCE_HOLD');

      await this.ledger.postJournal(
        'HOLD_REFUND',
        [
          { accountId: hold.accountId, amount: negate(tx.amount) },
          { accountId: sender.accountId, amount: tx.amount },
        ],
        { manager, transactionId },
      );

      await manager.getRepository(Transaction).update({ transactionId }, { status: 'REJECTED' });
      await this.audit.record(manager, {
        actorUserId: adminUserId,
        action: 'TX_REJECTED',
        transactionId,
        previousState: 'PENDING_REVIEW',
        newState: 'REJECTED',
      });

      return { ...tx, status: 'REJECTED' as const };
    });
  }

  /** Locks the transaction row and asserts it is PENDING_REVIEW (state machine). */
  private async lockPending(
    manager: EntityManager,
    transactionId: string,
  ): Promise<Transaction> {
    const tx = await manager
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.transaction_id = :id', { id: transactionId })
      .getOne();

    if (!tx) throw new TransactionNotFoundError();
    if (tx.status === 'SETTLED') throw new TransactionAlreadySettledError();
    if (tx.status === 'REJECTED') throw new TransactionAlreadyRejectedError();
    if (tx.status !== 'PENDING_REVIEW') throw new TransactionNotPendingReviewError();
    return tx;
  }
}
