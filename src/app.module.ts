import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LedgerModule } from './ledger/ledger.module';
import { TransfersModule } from './transfers/transfers.module';
import { AuditModule } from './audit/audit.module';
import { ComplianceModule } from './compliance/compliance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting (configurable). Protects auth/transfer endpoints from abuse.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    TypeOrmModule.forRoot(dataSourceOptions),
    HealthModule,
    UsersModule,
    LedgerModule,
    AuditModule,
    ComplianceModule,
    AuthModule,
    TransfersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
