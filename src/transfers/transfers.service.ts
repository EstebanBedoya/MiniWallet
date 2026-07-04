import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { LedgerService } from '../ledger/ledger.service';
import { AccountNotFoundError } from '../ledger/ledger.errors';
import { negate, toCents } from '../ledger/money';
import { AuditService } from '../audit/audit.service';
import { ComplianceService } from '../compliance/compliance.service';
import { Transaction } from './entities/transaction.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { TransferDto } from './dto/transfer.dto';
import {
  IdempotencyKeyConflictError,
  MissingIdempotencyKeyError,
  ReceiverNotFoundError,
  SelfTransferNotAllowedError,
} from './transfers.errors';

const HOLD_THRESHOLD_CENTS = 100000n; // $1000.00 (ADR-003)

export interface TransferResult {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string;
  status: string;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  async transfer(
    senderUserId: string,
    dto: TransferDto,
    idempotencyKey?: string,
  ): Promise<TransferResult> {
    if (!idempotencyKey) throw new MissingIdempotencyKeyError();
    if (toCents(dto.amount) <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'amount must be > 0',
      });
    }
    if (dto.receiverId === senderUserId) throw new SelfTransferNotAllowedError();

    const senderAccount = await this.ledger.getUserAccount(senderUserId);
    if (!senderAccount) throw new AccountNotFoundError();
    const receiverAccount = await this.ledger.getUserAccount(dto.receiverId);
    if (!receiverAccount) throw new ReceiverNotFoundError();

    const requestHash = this.hashRequest(senderUserId, dto);

    return this.dataSource.transaction(async (manager) => {
      const keys = manager.getRepository(IdempotencyKey);

      // Idempotency claim via ON CONFLICT DO NOTHING: never raises, so it can't
      // poison the transaction (a raised unique-violation aborts the whole tx in
      // Postgres). A concurrent duplicate blocks here until the other tx
      // commits/rolls back, then this returns 0 rows → replay branch.
      const claimed: unknown[] = await manager.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, request_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, senderUserId, requestHash],
      );

      if (claimed.length === 0) {
        // This user already used the key. Same params → replay; else conflict.
        const existing = await keys.findOne({
          where: { idempotencyKey, userId: senderUserId },
        });
        if (!existing || existing.requestHash !== requestHash) {
          throw new IdempotencyKeyConflictError();
        }
        return this.loadResult(manager, existing.transactionId);
      }

      // Two distinct state paths — kept in separate methods/services (project rule):
      // < $1000 settles immediately; >= $1000 goes through the compliance hold.
      const tx =
        toCents(dto.amount) >= HOLD_THRESHOLD_CENTS
          ? await this.compliance.placeHold(manager, {
              senderUserId,
              senderAccountId: senderAccount.accountId,
              receiverUserId: dto.receiverId,
              amount: dto.amount,
            })
          : await this.settleImmediately(manager, {
              senderUserId,
              senderAccountId: senderAccount.accountId,
              receiverUserId: dto.receiverId,
              receiverAccountId: receiverAccount.accountId,
              amount: dto.amount,
            });

      await keys.update(
        { idempotencyKey, userId: senderUserId },
        { transactionId: tx.transactionId, responseStatus: tx.status },
      );

      return this.toResult(tx);
    });
  }

  /** Settlement path (< $1000): debit sender, credit receiver, status SETTLED. */
  private async settleImmediately(
    manager: EntityManager,
    params: {
      senderUserId: string;
      senderAccountId: string;
      receiverUserId: string;
      receiverAccountId: string;
      amount: string;
    },
  ): Promise<Transaction> {
    const tx = await manager.getRepository(Transaction).save(
      manager.getRepository(Transaction).create({
        senderId: params.senderUserId,
        receiverId: params.receiverUserId,
        amount: params.amount,
        status: 'SETTLED',
      }),
    );

    // postJournal enforces the sender's non-negativity (INSUFFICIENT_BALANCE)
    // under a pessimistic lock — rolls everything back on failure.
    await this.ledger.postJournal(
      'TRANSFER_SETTLE',
      [
        { accountId: params.senderAccountId, amount: negate(params.amount) },
        { accountId: params.receiverAccountId, amount: params.amount },
      ],
      { manager, transactionId: tx.transactionId },
    );

    await this.audit.record(manager, {
      actorUserId: params.senderUserId,
      action: 'TRANSFER_SETTLED',
      transactionId: tx.transactionId,
      previousState: null,
      newState: 'SETTLED',
    });

    return tx;
  }

  private async loadResult(
    manager: EntityManager,
    transactionId: string | null,
  ): Promise<TransferResult> {
    if (!transactionId) throw new IdempotencyKeyConflictError();
    const tx = await manager
      .getRepository(Transaction)
      .findOne({ where: { transactionId } });
    if (!tx) throw new IdempotencyKeyConflictError();
    return this.toResult(tx);
  }

  private hashRequest(senderUserId: string, dto: TransferDto): string {
    return createHash('sha256')
      .update(`${senderUserId}:${dto.receiverId}:${dto.amount}`)
      .digest('hex');
  }

  private toResult(tx: Transaction): TransferResult {
    return {
      transactionId: tx.transactionId,
      senderId: tx.senderId,
      receiverId: tx.receiverId,
      amount: tx.amount,
      status: tx.status,
    };
  }
}
