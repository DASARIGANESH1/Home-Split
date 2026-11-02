import { describe, expect, it } from 'vitest';
import { addMember, api, apiJson, createBill, createHome, payShare } from './setup';

describe('POST /api/bills/:billId/shares/:shareId/pay', () => {
  async function setupBill(memberNames: string[], total = 1000) {
    const home = await createHome();
    for (const n of memberNames) await addMember(home.id, n);
    const bill = await createBill(home.id, 'Test Bill', total);
    return { home, bill };
  }

  it('pays an unpaid share and returns 200 with paid=true', async () => {
    const { bill } = await setupBill(['Alice', 'Bob', 'Carol']);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');
    const { status, body } = await payShare(bill.id, share.id, 'key-1');
    expect(status).toBe(200);
    expect(body.paid).toBe(true);
    expect(body.paidAt).not.toBeNull();
  });

  it('rejects missing Idempotency-Key header with 400', async () => {
    const { bill } = await setupBill(['A', 'B']);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');
    const { status, body } = await apiJson<{ error: string }>(
      'POST',
      `/api/bills/${bill.id}/shares/${share.id}/pay`,
    );
    expect(status).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects empty Idempotency-Key with 400', async () => {
    const { bill } = await setupBill(['A', 'B']);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');
    const res = await api('POST', `/api/bills/${bill.id}/shares/${share.id}/pay`, {
      idempotencyKey: '   ',
    });
    expect(res.status).toBe(400);
  });

  it('replays the same response for the same idempotency key', async () => {
    const { bill } = await setupBill(['A', 'B']);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');
    const first = await payShare(bill.id, share.id, 'replay-key');
    const second = await payShare(bill.id, share.id, 'replay-key');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The paidAt timestamps must be identical (replay returns the stored response).
    expect(second.body.paidAt).toBe(first.body.paidAt);
  });

  it('returns 409 when a different key pays an already-paid share', async () => {
    const { bill } = await setupBill(['A', 'B']);
    const share = bill.shares[0];
    if (!share) throw new Error('missing share');
    const first = await payShare(bill.id, share.id, 'key-A');
    const second = await payShare(bill.id, share.id, 'key-B');
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('SHARE_ALREADY_PAID');
  });

  it('returns 404 for an unknown share', async () => {
    const { bill } = await setupBill(['A', 'B']);
    const res = await api('POST', `/api/bills/${bill.id}/shares/nonexistent/pay`, {
      idempotencyKey: 'k',
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the share does not belong to the bill', async () => {
    const { bill: bill1 } = await setupBill(['A', 'B']);
    const { bill: bill2 } = await setupBill(['C', 'D']);
    // Take a share from bill2 and try to pay it under bill1's id.
    const foreignShare = bill2.shares[0];
    if (!foreignShare) throw new Error('missing share');
    const res = await api('POST', `/api/bills/${bill1.id}/shares/${foreignShare.id}/pay`, {
      idempotencyKey: 'cross-key',
    });
    expect(res.status).toBe(404);
  });

  it('allows paying each share of a bill independently', async () => {
    const { bill } = await setupBill(['A', 'B', 'C']);
    for (let i = 0; i < bill.shares.length; i++) {
      const share = bill.shares[i];
      if (!share) continue;
      const { status } = await payShare(bill.id, share.id, `key-${i}`);
      expect(status).toBe(200);
    }
  });

  it('rejects a reused idempotency key on a different share with 409 and does NOT pay it', async () => {
    const { bill } = await setupBill(['Alice', 'Bob']);
    const aliceShare = bill.shares[0];
    const bobShare = bill.shares[1];
    if (!aliceShare || !bobShare) throw new Error('missing shares');

    // Pay Alice's share with key-K
    const first = await payShare(bill.id, aliceShare.id, 'reused-key-K');
    expect(first.status).toBe(200);

    // Try to pay Bob's share with the SAME key-K
    const second = await payShare(bill.id, bobShare.id, 'reused-key-K');
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('IDEMPOTENCY_KEY_REUSED');

    // Verify Bob's share was NOT paid (no false success)
    const { body: body2 } = await apiJson<{ shares: { id: string; paid: boolean }[] }>(
      'GET',
      `/api/bills/${bill.id}`,
    );
    const bob = body2.shares.find((s) => s.id === bobShare.id);
    expect(bob?.paid).toBe(false);
  });
});
