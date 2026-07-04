import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LedgerService } from '../ledger/ledger.service';
import { User } from '../users/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail'>>;
  let ledgerService: jest.Mocked<Pick<LedgerService, 'provisionUserAccount'>>;
  let dataSource: { transaction: jest.Mock };
  let savedUser: jest.Mock;

  const buildUser = (overrides: Partial<User> = {}): User =>
    ({
      userId: '1',
      email: 'ana@example.com',
      name: 'Ana',
      passwordHash: bcrypt.hashSync('Sup3rS3cret!', 10),
      createdAt: new Date(),
      ...overrides,
    }) as User;

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn() };
    ledgerService = { provisionUserAccount: jest.fn() };

    // manager.getRepository(User) → repo whose save echoes the entity with an id.
    savedUser = jest.fn(async (u: Partial<User>) => ({
      ...u,
      userId: '1',
      createdAt: new Date(),
    }));
    const managerMock = {
      getRepository: () => ({ create: (u: Partial<User>) => u, save: savedUser }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(managerMock)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: LedgerService, useValue: ledgerService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('5000.00') },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('TC-AUTH-1: crea usuario (hasheado), NO expone el hash y provisiona cuenta+seed', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.register({
        email: 'ana@example.com',
        password: 'Sup3rS3cret!',
        name: 'Ana',
      });

      expect(result).toMatchObject({
        userId: '1',
        email: 'ana@example.com',
        name: 'Ana',
      });
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

      // se guardó hasheada, nunca en claro
      const saved = savedUser.mock.calls[0][0] as User;
      expect(saved.passwordHash).not.toBe('Sup3rS3cret!');
      expect(bcrypt.compareSync('Sup3rS3cret!', saved.passwordHash)).toBe(true);

      // TC-LED-1: se provisionó la cuenta con el saldo semilla
      expect(ledgerService.provisionUserAccount).toHaveBeenCalledWith(
        expect.anything(),
        '1',
        '5000.00',
      );
    });

    it('TC-AUTH-6: email duplicado (pre-check) → ConflictException', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({
          email: 'ANA@example.com',
          password: 'Sup3rS3cret!',
          name: 'Ana',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('TC-AUTH-6b: carrera concurrente (unique_violation) → ConflictException', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const dbError = new QueryFailedError('insert', [], {
        code: '23505',
      } as unknown as Error);
      dataSource.transaction.mockRejectedValue(dbError);

      await expect(
        service.register({
          email: 'ana@example.com',
          password: 'Sup3rS3cret!',
          name: 'Ana',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('TC-AUTH-2: credenciales correctas → devuelve accessToken', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      const result = await service.login({
        email: 'ana@example.com',
        password: 'Sup3rS3cret!',
      });

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('TC-AUTH-3: password incorrecta → UnauthorizedException', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.login({ email: 'ana@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('TC-AUTH-3b: email inexistente → UnauthorizedException (mismo error, no enumera)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever12' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
