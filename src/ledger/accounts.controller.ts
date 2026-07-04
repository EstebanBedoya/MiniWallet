import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerService } from './ledger.service';
import { AccountNotFoundError } from './ledger.errors';
import { Transaction } from '../transfers/entities/transaction.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly ledger: LedgerService,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.ledger.getUserAccount(user.userId);
    if (!account) throw new AccountNotFoundError();

    // Pending balances are computed (not stored) from transactions still in
    // PENDING_REVIEW — see DOMAIN_SPEC §3. Money held for compliance already
    // left balance_available (debited to COMPLIANCE_HOLD), so these are views,
    // never editable balances.
    const [pendingOutgoing, pendingIncoming] = await Promise.all([
      this.pendingTotal('senderId', user.userId),
      this.pendingTotal('receiverId', user.userId),
    ]);

    return {
      userId: user.userId,
      balanceAvailable: account.balance,
      pendingIncoming, // would arrive if the sender's holds are approved
      pendingOutgoing, // own money held awaiting review (returns if rejected)
    };
  }

  /** SUM(amount) of the user's PENDING_REVIEW transfers, as a NUMERIC(20,2) string. */
  private async pendingTotal(
    field: 'senderId' | 'receiverId',
    userId: string,
  ): Promise<string> {
    const row = await this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)::numeric(20,2)::text', 'sum')
      .where(`t.${field} = :userId`, { userId })
      .andWhere("t.status = 'PENDING_REVIEW'")
      .getRawOne<{ sum: string }>();
    return row?.sum ?? '0.00';
  }
}
