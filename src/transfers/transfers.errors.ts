import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class SelfTransferNotAllowedError extends UnprocessableEntityException {
  constructor() {
    super({ code: 'SELF_TRANSFER_NOT_ALLOWED', message: 'Cannot transfer to yourself' });
  }
}

export class ReceiverNotFoundError extends NotFoundException {
  constructor() {
    super({ code: 'RECEIVER_NOT_FOUND', message: 'Receiver account not found' });
  }
}

export class IdempotencyKeyConflictError extends ConflictException {
  constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: 'Idempotency-Key reused with different parameters',
    });
  }
}

export class MissingIdempotencyKeyError extends BadRequestException {
  constructor() {
    super({ code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required' });
  }
}
