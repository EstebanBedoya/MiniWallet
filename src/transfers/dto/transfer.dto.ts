import { Matches } from 'class-validator';

export class TransferDto {
  // bigint id as string.
  @Matches(/^\d+$/, { message: 'receiverId must be a numeric id' })
  receiverId: string;

  // Positive decimal with up to 2 places. Zero and negatives are rejected by
  // requiring at least one non-zero digit is handled in the service (> 0).
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal with up to 2 places',
  })
  amount: string;
}
