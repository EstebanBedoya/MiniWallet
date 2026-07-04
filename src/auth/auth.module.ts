import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [
    UsersModule,
    LedgerModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-real-deployments'),
        // Expiration in seconds (jsonwebtoken accepts a number of seconds).
        signOptions: {
          expiresIn: parseInt(config.get<string>('JWT_EXPIRES_IN', '3600'), 10),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AdminBootstrapService],
})
export class AuthModule {}
