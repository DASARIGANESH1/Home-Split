import { describe, expect, it } from 'vitest';
import type { HomeBalances, MemberBalance } from '../src/types';
import { addMember, apiJson, createBill, createHome, payShare } from './setup';

describe('GET /api/homes/:homeId/balances', () => {
  it('returns zero balances for a home with no bills', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');

    const { status, body } = await apiJson<HomeBalances>('GET', `/api/homes/${home.id}/balances`);
    expect(status).toBe(200);
    expect(body.homeId).toBe(home.id);
    expect(body.members).toHaveLength(2);
    expect(body.members[0]?.memberName).toBe('Alice');
    expect(body.members.every((m) => m.outstandingBalance === 0)).toBe(true);
    expect(body.totals).toEqual({ totalBilled: 0, totalPaid: 0, totalOutstanding: 0 });
  });

  it('calculates outstanding amounts excluding paid shares', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');
    await addMember(home.id, 'Carol');

    const bill = await createBill(home.id, 'Dinner', 1000); // split: 334,333,333
    // Pay Alice's share only.
    const aliceShare = bill.shares[0];
    if (!aliceShare) throw new Error('missing share');
    await payShare(bill.id, aliceShare.id, 'alice-key');

    const { status, body } = await apiJson<HomeBalances>('GET', `/api/homes/${home.id}/balances`);
    expect(status).toBe(200);
    expect(body.members).toHaveLength(3);

    const find = (name: string): MemberBalance => {
      const m = body.members.find((x) => x.memberName === name);
      if (!m) throw new Error(`member ${name} not found`);
      return m;
    };
    const alice = find('Alice');
    const bob = find('Bob');
    const carol = find('Carol');

    // 1000 / 3 -> base 333, remainder 1 -> [334, 333, 333]
    expect(alice.totalShare).toBe(334);
    expect(alice.paidAmount).toBe(334);
    expect(alice.outstandingBalance).toBe(0);

    expect(bob.totalShare).toBe(333);
    expect(bob.paidAmount).toBe(0);
    expect(bob.outstandingBalance).toBe(333);

    expect(carol.totalShare).toBe(333);
    expect(carol.paidAmount).toBe(0);
    expect(carol.outstandingBalance).toBe(333);

    expect(body.totals.totalBilled).toBe(1000);
    expect(body.totals.totalPaid).toBe(334);
    expect(body.totals.totalOutstanding).toBe(666);
  });

  it('returns 404 for an unknown home', async () => {
    const { status } = await apiJson('GET', '/api/homes/no-such-home/balances');
    expect(status).toBe(404);
  });

  it('preserves member order (position ascending)', async () => {
    const home = await createHome();
    await addMember(home.id, 'First');
    await addMember(home.id, 'Second');
    await addMember(home.id, 'Third');

    const { body } = await apiJson<HomeBalances>('GET', `/api/homes/${home.id}/balances`);
    const names = body.members.map((m) => m.memberName);
    expect(names).toEqual(['First', 'Second', 'Third']);
  });

  it('does not leak balances across homes', async () => {
    const home1 = await createHome('Home 1');
    const home2 = await createHome('Home 2');
    await addMember(home1.id, 'A1');
    await addMember(home2.id, 'A2');
    await createBill(home1.id, 'Bill', 500);

    const r1 = await apiJson<HomeBalances>('GET', `/api/homes/${home1.id}/balances`);
    const r2 = await apiJson<HomeBalances>('GET', `/api/homes/${home2.id}/balances`);

    expect(r1.body.totals.totalBilled).toBe(500);
    expect(r2.body.totals.totalBilled).toBe(0);
  });
});
