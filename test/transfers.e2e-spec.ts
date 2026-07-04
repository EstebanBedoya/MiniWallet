import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';

// Enough seed to also exercise a >= $1000 hold, but low enough that a < $1000
// amount can still overdraw for the insufficient-balance case.
process.env.SEED_BALANCE = '2000.00';
process.env.ADMIN_EMAIL = 'admin@miniwallet.local';
process.env.ADMIN_PASSWORD = 'admin12345';
// The suite fires many requests from one IP; lift the rate limit for tests.
process.env.THROTTLE_LIMIT = '100000';

import { AppModule } from '../src/app.module';

jest.setTimeout(30000);

describe('Transfers flow (e2e) — TC-INT-1', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: () => ReturnType<typeof request>;

  const register = (name: string) => {
    const email = `${name}-${randomUUID()}@example.com`;
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rS3cret!', name })
      .then((res) => ({ email, userId: res.body.userId as string }));
  };

  const login = (email: string, password = 'Sup3rS3cret!') =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .then((res) => res.body.accessToken as string);

  const balance = (token: string) =>
    request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', `Bearer ${token}`)
      .then((res) => res.body.balanceAvailable as string);

  const account = (token: string) =>
    request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', `Bearer ${token}`)
      .then(
        (res) =>
          res.body as {
            balanceAvailable: string;
            pendingIncoming: string;
            pendingOutgoing: string;
          },
      );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    ds = app.get(DataSource);
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('settles a < $1000 transfer and moves the money exactly', async () => {
    const sender = await register('sender');
    const receiver = await register('receiver');
    const token = await login(sender.email);
    const receiverToken = await login(receiver.email);

    const res = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: receiver.userId, amount: '250.00' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SETTLED');

    expect(await balance(token)).toBe('1750.00'); // 2000 - 250
    expect(await balance(receiverToken)).toBe('2250.00'); // 2000 + 250
  });

  it('is idempotent: same key + params does not double-spend', async () => {
    const sender = await register('idem-s');
    const receiver = await register('idem-r');
    const token = await login(sender.email);
    const key = randomUUID();
    const body = { receiverId: receiver.userId, amount: '100.00' };

    const first = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
    const second = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);

    expect(first.body.transactionId).toBe(second.body.transactionId);
    expect(await balance(token)).toBe('1900.00'); // debited once (2000 - 100), not twice

    // Same key, different params → conflict.
    const conflict = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ receiverId: receiver.userId, amount: '101.00' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');

    // The key is scoped per user: a DIFFERENT user can reuse the same key value
    // with the same params and gets their OWN transfer, not the first user's.
    const other = await register('idem-other');
    const otherToken = await login(other.email);
    const otherTx = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(otherTx.status).toBe(201);
    expect(otherTx.body.transactionId).not.toBe(first.body.transactionId);
    expect(otherTx.body.senderId).toBe(other.userId);
    expect(await balance(otherToken)).toBe('1900.00'); // 2000 - 100, its own debit
  });

  it('rejects self-transfer, missing receiver, insufficient balance and >= $1000', async () => {
    const sender = await register('errs');
    const token = await login(sender.email);

    const self = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: sender.userId, amount: '10.00' });
    expect(self.status).toBe(422);
    expect(self.body.code).toBe('SELF_TRANSFER_NOT_ALLOWED');

    const missing = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: '999999999', amount: '10.00' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('RECEIVER_NOT_FOUND');

    const receiver = await register('errs-r');
    const insufficient = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: receiver.userId, amount: '3000.00' }); // seed is 2000
    expect(insufficient.status).toBe(422);
    expect(insufficient.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('holds >= $1000, then admin approves (money reaches receiver only then)', async () => {
    const sender = await register('hold-s');
    const receiver = await register('hold-r');
    const token = await login(sender.email);
    const receiverToken = await login(receiver.email);
    const adminToken = await login('admin@miniwallet.local', 'admin12345');

    const hold = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: receiver.userId, amount: '1500.00' });

    expect(hold.status).toBe(202);
    expect(hold.body.status).toBe('PENDING_REVIEW');
    // Sender already debited; receiver NOT credited yet (T1).
    expect(await balance(token)).toBe('500.00'); // 2000 - 1500 held
    expect(await balance(receiverToken)).toBe('2000.00'); // unchanged

    // Pending balances (computed from PENDING_REVIEW) surface the hold: the
    // sender sees it as outgoing (could return), the receiver as incoming.
    const senderPending = await account(token);
    expect(senderPending.pendingOutgoing).toBe('1500.00');
    expect(senderPending.pendingIncoming).toBe('0.00');
    const receiverPending = await account(receiverToken);
    expect(receiverPending.pendingIncoming).toBe('1500.00');
    expect(receiverPending.pendingOutgoing).toBe('0.00');

    // Non-admin cannot approve.
    const forbidden = await http()
      .post(`/admin/transactions/${hold.body.transactionId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);

    // Admin approves → settles, receiver finally credited.
    const approve = await http()
      .post(`/admin/transactions/${hold.body.transactionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('SETTLED');
    expect(await balance(receiverToken)).toBe('3500.00'); // 2000 + 1500

    // Once settled, the hold clears from both pending views.
    expect((await account(token)).pendingOutgoing).toBe('0.00');
    expect((await account(receiverToken)).pendingIncoming).toBe('0.00');

    // Re-approving a settled tx is rejected by the state machine.
    const again = await http()
      .post(`/admin/transactions/${hold.body.transactionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TRANSACTION_ALREADY_SETTLED');
  });

  it('holds >= $1000, then admin rejects (sender refunded, receiver untouched)', async () => {
    const sender = await register('rej-s');
    const receiver = await register('rej-r');
    const token = await login(sender.email);
    const receiverToken = await login(receiver.email);
    const adminToken = await login('admin@miniwallet.local', 'admin12345');

    const hold = await http()
      .post('/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ receiverId: receiver.userId, amount: '1200.00' });
    expect(hold.status).toBe(202);
    expect(await balance(token)).toBe('800.00'); // 2000 - 1200 held

    const reject = await http()
      .post(`/admin/transactions/${hold.body.transactionId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('REJECTED');

    expect(await balance(token)).toBe('2000.00'); // refunded
    expect(await balance(receiverToken)).toBe('2000.00'); // never received
  });

  it('returns the paginated transaction history, newest first', async () => {
    const sender = await register('hist-s');
    const receiver = await register('hist-r');
    const token = await login(sender.email);

    for (const amount of ['100.00', '150.00']) {
      await http()
        .post('/transfers')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ receiverId: receiver.userId, amount });
    }

    const res = await http()
      .get('/transactions?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const [first, second] = res.body.data;
    expect(new Date(first.createdAt) >= new Date(second.createdAt)).toBe(true);

    // No token → 401.
    const anon = await http().get('/transactions');
    expect(anon.status).toBe(401);
  });

  it('flags suspicious transactions (structuring + high amount), admin-only', async () => {
    const sender = await register('struct-s');
    const receiver = await register('struct-r');
    const token = await login(sender.email);
    const adminToken = await login('admin@miniwallet.local', 'admin12345');

    // Structuring: two transfers just under $1000 from the same sender.
    for (const amount of ['950.00', '950.00']) {
      await http()
        .post('/transfers')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ receiverId: receiver.userId, amount });
    }

    const res = await http()
      .get('/admin/transactions/suspicious')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const allReasons = (res.body as Array<{ reasons: string[] }>).flatMap(
      (t) => t.reasons,
    );
    expect(allReasons).toContain('STRUCTURING'); // the criterion that matters (evasion)
    expect(allReasons).toContain('HIGH_AMOUNT'); // from the >= $1000 holds earlier

    // Non-admin is forbidden.
    const forbidden = await http()
      .get('/admin/transactions/suspicious')
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
  });

  it('serializes concurrent transfers on the same sender — no overdraft (TC-CONC-1/2)', async () => {
    const sender = await register('conc-s');
    const receiver = await register('conc-r');
    const token = await login(sender.email);

    // Seed is 2000. Fire 5 concurrent transfers of 500 (total 2500 > 2000):
    // exactly 4 must fit, 1 must fail, and the balance must never go negative.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        http()
          .post('/transfers')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', randomUUID())
          .send({ receiverId: receiver.userId, amount: '500.00' }),
      ),
    );

    const ok = attempts.filter((r) => r.status === 201);
    const failed = attempts.filter((r) => r.status === 422);
    expect(ok).toHaveLength(4);
    expect(failed).toHaveLength(1);
    expect(failed[0].body.code).toBe('INSUFFICIENT_BALANCE');
    expect(await balance(token)).toBe('0.00'); // drained exactly, never negative
  });

  it('does not deadlock on crossing transfers A->B and B->A (TC-CONC-4)', async () => {
    const a = await register('cross-a');
    const b = await register('cross-b');
    const ta = await login(a.email);
    const tb = await login(b.email);

    const [r1, r2] = await Promise.all([
      http()
        .post('/transfers')
        .set('Authorization', `Bearer ${ta}`)
        .set('Idempotency-Key', randomUUID())
        .send({ receiverId: b.userId, amount: '100.00' }),
      http()
        .post('/transfers')
        .set('Authorization', `Bearer ${tb}`)
        .set('Idempotency-Key', randomUUID())
        .send({ receiverId: a.userId, amount: '100.00' }),
    ]);

    // Ordered locks (by account_id) prevent the classic deadlock; both settle.
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('holds the accounting invariants after all the activity', async () => {
    const [{ sum }] = await ds.query(
      'SELECT COALESCE(SUM(balance),0) AS sum FROM accounts',
    );
    expect(Number(sum)).toBe(0); // conservation

    const brokenJournals = await ds.query(
      'SELECT journal_id FROM ledger_entries GROUP BY journal_id HAVING SUM(amount) <> 0',
    );
    expect(brokenJournals).toHaveLength(0); // each journal balances

    const negative = await ds.query(
      "SELECT account_id FROM accounts WHERE account_type IN ('USER','COMPLIANCE_HOLD') AND balance < 0",
    );
    expect(negative).toHaveLength(0); // no negative user/hold balances
  });
});
