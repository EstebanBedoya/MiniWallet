import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransfersService } from './transfers.service';
import { LedgerService } from '../ledger/ledger.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import {
  MissingIdempotencyKeyError,
  SelfTransferNotAllowedError,
} from './transfers.errors';

describe('TransfersService (guards previos a la transacción)', () => {
  let service: TransfersService;
  let ledger: jest.Mocked<Pick<LedgerService, 'getUserAccount'>>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    ledger = { getUserAccount: jest.fn() };
    dataSource = { transaction: jest.fn() };
    service = new TransfersService(
      dataSource as unknown as DataSource,
      ledger as unknown as LedgerService,
      {} as ComplianceService,
      {} as AuditService,
    );
  });

  it('TC-IDEM-4: sin Idempotency-Key → MissingIdempotencyKeyError', async () => {
    await expect(
      service.transfer('1', { receiverId: '2', amount: '250.00' }, undefined),
    ).rejects.toBeInstanceOf(MissingIdempotencyKeyError);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('TC-XFER-6: monto 0 → BadRequest (INVALID_AMOUNT)', async () => {
    await expect(
      service.transfer('1', { receiverId: '2', amount: '0.00' }, 'key-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TC-XFER-4: emisor == receptor → SelfTransferNotAllowedError', async () => {
    await expect(
      service.transfer('1', { receiverId: '1', amount: '250.00' }, 'key-1'),
    ).rejects.toBeInstanceOf(SelfTransferNotAllowedError);
    expect(ledger.getUserAccount).not.toHaveBeenCalled();
  });
});
