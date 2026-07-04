import { ConflictException, NotFoundException } from '@nestjs/common';

export class TransactionNotFoundError extends NotFoundException {
  constructor() {
    super({ code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' });
  }
}

export class TransactionNotPendingReviewError extends ConflictException {
  constructor() {
    super({
      code: 'TRANSACTION_NOT_PENDING_REVIEW',
      message: 'Transaction is not pending review',
    });
  }
}

export class TransactionAlreadySettledError extends ConflictException {
  constructor() {
    super({ code: 'TRANSACTION_ALREADY_SETTLED', message: 'Transaction already settled' });
  }
}

export class TransactionAlreadyRejectedError extends ConflictException {
  constructor() {
    super({ code: 'TRANSACTION_ALREADY_REJECTED', message: 'Transaction already rejected' });
  }
}
