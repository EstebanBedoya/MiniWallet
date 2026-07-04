import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** A journal whose lines do not sum to zero — a programming bug, never user input. */
export class UnbalancedJournalError extends InternalServerErrorException {
  constructor() {
    super({ code: 'UNBALANCED_JOURNAL', message: 'Journal lines do not sum to zero' });
  }
}

/** A debit would drive a non-system account below zero. */
export class InsufficientBalanceError extends UnprocessableEntityException {
  constructor() {
    super({ code: 'INSUFFICIENT_BALANCE', message: 'Insufficient available balance' });
  }
}

/** Used when a user has no ledger account yet. */
export class AccountNotFoundError extends HttpException {
  constructor() {
    super(
      { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      HttpStatus.NOT_FOUND,
    );
  }
}
