import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { LedgerService } from '../ledger/ledger.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// PostgreSQL unique_violation.
const PG_UNIQUE_VIOLATION = '23505';
const DEFAULT_SEED_BALANCE = '5000.00';

export interface PublicUser {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    // Fast path: friendly error before hashing. The DB unique index below is
    // the actual guarantee against a concurrent duplicate (TOCTOU race).
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw this.emailAlreadyRegistered();
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const seed = this.config.get<string>('SEED_BALANCE', DEFAULT_SEED_BALANCE);

    try {
      // Atomic: user + USER account + SEED journal all commit together, or none.
      const user = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(User);
        const created = await repo.save(
          repo.create({ email: dto.email, name: dto.name, passwordHash }),
        );
        await this.ledgerService.provisionUserAccount(manager, created.userId, seed);
        return created;
      });
      return this.toPublicUser(user);
    } catch (err) {
      // Two concurrent registrations with the same email: the unique index on
      // LOWER(email) rejects the loser here — map it to the same 409.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw this.emailAlreadyRegistered();
      }
      throw err;
    }
  }

  private emailAlreadyRegistered(): ConflictException {
    return new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'A user with this email already exists',
    });
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    // Generic failure: never reveal whether it was the email or the password.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const accessToken = this.jwtService.sign({
      sub: user.userId,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
