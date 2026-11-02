import { describe, expect, it } from 'vitest';
import { addMember, createBill, createHome, payShare } from './setup';

/**
 * Concurrency tests: fire N parallel pay requests for the SAME share.
 *   - Exactly one must return 200 (the winner).
 *   - The rest must return 200 (replay, same key) OR 409 (different key).
 *   - The share's paid_at must be set exactly once.
 *   - For same-key concurrent requests: all must return 200 and the same paidAt.
 *   - For different-key concurrent requests: exactly one 200, the rest 409.
 */
describe('concurrent payment safety', () => {
  it('same idempotency key, N concurrent requests — all return the same paidAt', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');
    const bill = await createBill(home.id, 'Concurrent Bill', 500);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');

    const N = 8;
    const responses = await Promise.all(
      Array.from({ length: N }, () => payShare(bill.id, share.id, 'same-key')),
    );

    const statuses = responses.map((r) => r.status);
    // Every response must be 200 — same key means idempotent replay for all.
    for (const s of statuses) expect(s).toBe(200);

    // All paidAt values must be identical (single canonical response).
    const paidAts = new Set(responses.map((r) => r.body.paidAt));
    expect(paidAts.size).toBe(1);
  });

  it('different idempotency keys, N concurrent requests — exactly one 200, rest 409', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');
    const bill = await createBill(home.id, 'Concurrent Bill', 500);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');

    const N = 10;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) => payShare(bill.id, share.id, `key-${i}`)),
    );

    const statuses = responses.map((r) => r.status).sort();
    const okCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(okCount).toBe(1);
    expect(conflictCount).toBe(N - 1);
  });

  it('concurrent payment of DIFFERENT shares of the same bill — all succeed independently', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');
    await addMember(home.id, 'Carol');
    const bill = await createBill(home.id, 'Split Bill', 900);

    const results = await Promise.all(
      bill.shares.map((s, i) => payShare(bill.id, s.id, `share-key-${i}`)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('mixed: pay same share twice sequentially then a different key — 200, 200 (replay), 409', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    const bill = await createBill(home.id, 'Seq Bill', 100);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');

    const r1 = await payShare(bill.id, share.id, 'k1');
    const r2 = await payShare(bill.id, share.id, 'k1');
    const r3 = await payShare(bill.id, share.id, 'k2');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(409);
    expect(r2.body.paidAt).toBe(r1.body.paidAt);
  });
});
