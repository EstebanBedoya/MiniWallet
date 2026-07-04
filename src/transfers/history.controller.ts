import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HistoryService, PagedTransactions } from './history.service';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('transactions')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ): Promise<PagedTransactions> {
    return this.history.list(user.userId, pagination.page, pagination.limit);
  }
}
