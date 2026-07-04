import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { SuspiciousService, SuspiciousTransaction } from './suspicious.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('admin/transactions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly suspicious: SuspiciousService,
  ) {}

  @Get('suspicious')
  findSuspicious(): Promise<SuspiciousTransaction[]> {
    return this.suspicious.find();
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    const tx = await this.compliance.approve(id, admin.userId);
    return { transactionId: tx.transactionId, status: tx.status };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    const tx = await this.compliance.reject(id, admin.userId);
    return { transactionId: tx.transactionId, status: tx.status };
  }
}
