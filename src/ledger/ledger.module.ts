import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Journal } from './entities/journal.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './ledger.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account, Journal, LedgerEntry])],
  providers: [LedgerService],
  controllers: [AccountsController],
  exports: [LedgerService],
})
export class LedgerModule {}
