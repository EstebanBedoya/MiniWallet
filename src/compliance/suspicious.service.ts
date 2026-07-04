import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface SuspiciousTransaction {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string;
  status: string;
  createdAt: Date;
  reasons: string[];
}

interface FlaggedRow {
  transaction_id: string;
  sender_id: string;
  receiver_id: string;
  amount: string;
  status: string;
  created_at: Date;
  high_amount: boolean;
  velocity: boolean;
  structuring: boolean;
}

@Injectable()
export class SuspiciousService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * Read-only detection (DOMAIN_SPEC §4). Reports, never blocks. Thresholds are
   * configurable (ADR-005). C4 (account drain) is deferred — needs a balance
   * snapshot at transaction time.
   */
  async find(): Promise<SuspiciousTransaction[]> {
    const velocityCount = this.num('SUSPICIOUS_VELOCITY_COUNT', 5);
    const velocityWindowMin = this.num('SUSPICIOUS_VELOCITY_WINDOW_MIN', 1);
    const structuringCount = this.num('SUSPICIOUS_STRUCTURING_COUNT', 2);
    const structuringWindowMin = this.num('SUSPICIOUS_STRUCTURING_WINDOW_MIN', 10);

    const rows: FlaggedRow[] = await this.dataSource.query(
      `
      WITH flagged AS (
        SELECT t.transaction_id, t.sender_id, t.receiver_id, t.amount, t.status, t.created_at,
          (t.amount >= 1000) AS high_amount,
          ((SELECT count(*) FROM transactions v
             WHERE v.sender_id = t.sender_id
               AND v.created_at BETWEEN t.created_at - make_interval(mins => $2) AND t.created_at
           ) >= $1) AS velocity,
          (t.amount >= 900 AND t.amount < 1000 AND
           (SELECT count(*) FROM transactions s
             WHERE s.sender_id = t.sender_id
               AND s.amount >= 900 AND s.amount < 1000
               AND s.created_at BETWEEN t.created_at - make_interval(mins => $4) AND t.created_at
           ) >= $3) AS structuring
        FROM transactions t
      )
      SELECT * FROM flagged
      WHERE high_amount OR velocity OR structuring
      ORDER BY created_at DESC
      `,
      [velocityCount, velocityWindowMin, structuringCount, structuringWindowMin],
    );

    return rows.map((r) => {
      const reasons: string[] = [];
      if (r.high_amount) reasons.push('HIGH_AMOUNT');
      if (r.velocity) reasons.push('VELOCITY');
      if (r.structuring) reasons.push('STRUCTURING');
      return {
        transactionId: r.transaction_id,
        senderId: r.sender_id,
        receiverId: r.receiver_id,
        amount: r.amount,
        status: r.status,
        createdAt: r.created_at,
        reasons,
      };
    });
  }

  private num(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
