import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditRecord {
  actorUserId: string | null;
  action: string;
  transactionId: string | null;
  previousState: string | null;
  newState: string | null;
}

@Injectable()
export class AuditService {
  /** Writes an audit row inside the caller's transaction. Append-only. */
  async record(manager: EntityManager, data: AuditRecord): Promise<void> {
    // metadata defaults to '{}' in the DB; populated in a later iteration.
    await manager.getRepository(AuditLog).insert({
      actorUserId: data.actorUserId,
      action: data.action,
      transactionId: data.transactionId,
      previousState: data.previousState,
      newState: data.newState,
    });
  }
}
