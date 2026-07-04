import { Controller, Get, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { AccountNotFoundError } from './ledger.errors';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.ledger.getUserAccount(user.userId);
    if (!account) throw new AccountNotFoundError();
    return {
      userId: user.userId,
      balanceAvailable: account.balance,
      // Pending is 0 until transfers exist (Slice 3).
      pendingIncoming: '0.00',
      pendingOutgoing: '0.00',
    };
  }
}
