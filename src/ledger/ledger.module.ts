import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Journal } from './entities/journal.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { Transaction } from '../transfers/entities/transaction.entity';
import { LedgerService } from './ledger.service';
import { AccountsController } from './accounts.controller';

@Module({
  // Transaction is registered read-only here to compute pending balances from
  // PENDING_REVIEW rows; it does not create a module cycle (only the entity is
  // referenced, not TransfersModule).
  imports: [TypeOrmModule.forFeature([Account, Journal, LedgerEntry, Transaction])],
  providers: [LedgerService],
  controllers: [AccountsController],
  exports: [LedgerService],
})
export class LedgerModule {}
