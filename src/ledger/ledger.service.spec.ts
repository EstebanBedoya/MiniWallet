import { DataSource, EntityManager } from 'typeorm';
import { LedgerService } from './ledger.service';
import { UnbalancedJournalError } from './ledger.errors';

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(() => {
    // DataSource unused for the guard test (we pass a manager to skip it).
    service = new LedgerService({} as DataSource);
  });

  it('TC-LED-3: rechaza un journal que no suma cero, sin tocar la DB', async () => {
    const manager = {
      getRepository: jest.fn(),
      query: jest.fn(),
    } as unknown as EntityManager;

    await expect(
      service.postJournal(
        'SEED',
        [
          { accountId: '1', amount: '-5000.00' },
          { accountId: '2', amount: '4999.99' },
        ],
        { manager },
      ),
    ).rejects.toBeInstanceOf(UnbalancedJournalError);

    // No escribió nada: el guard corre antes de cualquier acceso a la DB.
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });
});
