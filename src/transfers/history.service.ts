import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';

export interface PagedTransactions {
  data: Transaction[];
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  /** Transactions where the user is sender or receiver, newest first, paginated. */
  async list(userId: string, page: number, limit: number): Promise<PagedTransactions> {
    const [data, total] = await this.transactions
      .createQueryBuilder('t')
      .where(
        new Brackets((qb) => {
          qb.where('t.sender_id = :userId', { userId }).orWhere(
            't.receiver_id = :userId',
            { userId },
          );
        }),
      )
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, page, limit, total };
  }
}
