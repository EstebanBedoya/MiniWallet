import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TransfersService, TransferResult } from './transfers.service';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TransferResult> {
    const result = await this.transfers.transfer(user.userId, dto, idempotencyKey);
    // 202 Accepted when held for review, 201 Created when settled immediately.
    res.status(result.status === 'PENDING_REVIEW' ? 202 : 201);
    return result;
  }
}
