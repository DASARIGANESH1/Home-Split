import { describe, expect, it } from 'vitest';
import { addMember, api, apiJson, createBill, createHome } from './setup';

describe('POST /api/homes/:homeId/bills', () => {
  it('creates a bill with split shares for 3 members (1000/3)', async () => {
    const home = await createHome();
    await addMember(home.id, 'Alice');
    await addMember(home.id, 'Bob');
    await addMember(home.id, 'Carol');

    const bill = await createBill(home.id, 'Groceries', 1000);
    expect(bill.totalAmount).toBe(1000);
    expect(bill.shares).toHaveLength(3);

    // Remainder 1 -> first member gets the extra cent.
    const amounts = bill.shares.map((s) => s.amount).sort((a, b) => b - a);
    expect(amounts).toEqual([334, 333, 333]);
    expect(bill.shares.reduce((s, x) => s + x.amount, 0)).toBe(1000);

    // All shares start unpaid.
    expect(bill.shares.every((s) => s.paid === false)).toBe(true);
  });

  it('returns 404 when the home does not exist', async () => {
    const { status } = await apiJson('POST', '/api/homes/unknown-home/bills', {
      body: { title: 'X', totalAmount: 1000 },
    });
    expect(status).toBe(404);
  });

  it('rejects empty member list with 400', async () => {
    const home = await createHome('Empty Home');
    const { status, body } = await apiJson<{ error: string }>(
      'POST',
      `/api/homes/${home.id}/bills`,
      { body: { title: 'X', totalAmount: 1000 } },
    );
    expect(status).toBe(400);
    expect(body.error).toBe('NO_MEMBERS');
  });

  it('rejects invalid amount (zero) with 400', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    const res = await api('POST', `/api/homes/${home.id}/bills`, {
      body: { title: 'X', totalAmount: 0 },
    });
    expect(res.status).toBe(400);
  });

  it('rejects negative amount with 400', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    const res = await api('POST', `/api/homes/${home.id}/bills`, {
      body: { title: 'X', totalAmount: -50 },
    });
    expect(res.status).toBe(400);
  });

  it('rejects decimal amount with 400', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    const res = await api('POST', `/api/homes/${home.id}/bills`, {
      body: { title: 'X', totalAmount: 10.5 },
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-number amount with 400', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    const res = await api('POST', `/api/homes/${home.id}/bills`, {
      body: { title: 'X', totalAmount: '1000' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing title with 400', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    const res = await api('POST', `/api/homes/${home.id}/bills`, {
      body: { totalAmount: 1000 },
    });
    expect(res.status).toBe(400);
  });

  it('handles single member (no remainder)', async () => {
    const home = await createHome();
    await addMember(home.id, 'Solo');
    const bill = await createBill(home.id, 'Solo Bill', 7777);
    expect(bill.shares).toHaveLength(1);
    expect(bill.shares[0]?.amount).toBe(7777);
  });

  it('handles amount smaller than member count', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    await addMember(home.id, 'B');
    await addMember(home.id, 'C');
    await addMember(home.id, 'D');
    await addMember(home.id, 'E');
    const bill = await createBill(home.id, 'Tiny', 3);
    const amounts = bill.shares.map((s) => s.amount);
    expect(amounts).toEqual([1, 1, 1, 0, 0]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('creates multiple bills independently', async () => {
    const home = await createHome();
    await addMember(home.id, 'A');
    await addMember(home.id, 'B');
    const b1 = await createBill(home.id, 'Bill 1', 100);
    const b2 = await createBill(home.id, 'Bill 2', 200);
    expect(b1.id).not.toBe(b2.id);
    expect(b1.shares).toHaveLength(2);
    expect(b2.shares).toHaveLength(2);
  });
});
