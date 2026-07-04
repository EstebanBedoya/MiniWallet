import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';
import { Transaction } from '../transfers/entities/transaction.entity';
import { ComplianceService } from './compliance.service';
import { SuspiciousService } from './suspicious.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), LedgerModule, AuditModule],
  providers: [ComplianceService, SuspiciousService],
  controllers: [AdminController],
  exports: [ComplianceService],
})
export class ComplianceModule {}
