import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { Transaction } from './entities/transaction.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, IdempotencyKey]),
    LedgerModule,
    AuditModule,
    ComplianceModule,
  ],
  providers: [TransfersService, HistoryService],
  controllers: [TransfersController, HistoryController],
})
export class TransfersModule {}
