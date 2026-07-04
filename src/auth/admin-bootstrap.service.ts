import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

/**
 * Ensures an ADMIN user exists on boot from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Idempotent: does nothing if the env is unset or the admin already exists.
 * The admin has no ledger account (admins review, they don't transfer).
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    if (await this.usersService.findByEmail(email)) return;

    const passwordHash = await bcrypt.hash(password, 10);
    await this.usersService.create({
      email,
      name: 'Administrator',
      passwordHash,
      role: 'ADMIN',
    });
    this.logger.log(`Bootstrapped admin user: ${email}`);
  }
}
