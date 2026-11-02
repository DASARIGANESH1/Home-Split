import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound } from '../lib/errors';
import { generateId } from '../lib/ids';
import { mapBill, mapShare } from '../lib/mappers';
import { SplitError, splitEqually } from '../lib/split';
import { requireBody, validateName, validatePositiveAmountCents } from '../lib/validation';
import type { Bill, Share } from '../types';

/**
 * Bill creation is mounted under /api/homes (POST /:homeId/bills).
 * Bill fetch is mounted under /api/bills (GET /:billId).
 * They are separate Hono instances so the path params resolve correctly.
 */
export const billsCreateRoute = new Hono<{ Bindings: Env }>();
export const billsFetchRoute = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /:homeId/bills — create a bill and split it across members
// (mounted at /api/homes)
// ---------------------------------------------------------------------------
billsCreateRoute.post('/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId');
  const body = requireBody(await c.req.json().catch(() => null));
  const title = validateName(body.title, 'title', 200);
  const totalAmount = validatePositiveAmountCents(body.totalAmount, 'totalAmount');

  // Home existence
  const homeRow = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>();
  if (!homeRow) {
    throw notFound('HOME_NOT_FOUND', `home '${homeId}' was not found`);
  }

  // Load members in deterministic position order — this order defines who
  // receives the extra remainder cents.
  const { results: memberRows } = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY position ASC',
  )
    .bind(homeId)
    .all<{ id: string; name: string }>();

  const members = memberRows ?? [];
  if (members.length === 0) {
    throw badRequest('NO_MEMBERS', `home '${homeId}' has no members to split the bill`);
  }

  // Compute integer-cent shares. Sum is guaranteed to equal totalAmount.
  let amounts: number[];
  try {
    amounts = splitEqually(totalAmount, members.length);
  } catch (e) {
    if (e instanceof SplitError) {
      throw badRequest('INVALID_SPLIT', e.message);
    }
    throw e;
  }

  const now = new Date().toISOString();
  const bill: Bill = {
    id: generateId(),
    homeId,
    title,
    totalAmount,
    createdAt: now,
    shares: [],
  };

  // Build share rows. Member order === remainder-allocation order.
  const shares: Share[] = members.map((m, i) => ({
    id: generateId(),
    billId: bill.id,
    memberId: m.id,
    memberName: m.name,
    amount: amounts[i] ?? 0,
    paid: false,
    paidAt: null,
  }));

  // Atomic insert: bill + all its shares in a single D1 transaction (batch).
  const stmts = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_amount, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(bill.id, bill.homeId, bill.title, bill.totalAmount, bill.createdAt),
    ...shares.map((s) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount, paid_at, paid_idempotency_key, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)',
      ).bind(s.id, s.billId, s.memberId, s.amount, bill.createdAt),
    ),
  ];

  try {
    await c.env.DB.batch(stmts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('FOREIGN KEY')) {
      throw badRequest('INVALID_MEMBERS', 'one or more members no longer exist');
    }
    throw err;
  }

  return c.json({ ...bill, shares }, 201);
});

// ---------------------------------------------------------------------------
// GET /:billId — fetch a bill with its shares
// (mounted at /api/bills)
// ---------------------------------------------------------------------------
billsFetchRoute.get('/:billId', async (c) => {
  const billId = c.req.param('billId');
  const billRow = await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(billId).first();
  if (!billRow) {
    throw notFound('BILL_NOT_FOUND', `bill '${billId}' was not found`);
  }
  const bill = mapBill(billRow as never);

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.bill_id, s.member_id, m.name AS member_name, s.amount,
            s.paid_at, s.paid_idempotency_key
       FROM shares s
       JOIN members m ON m.id = s.member_id
      WHERE s.bill_id = ?
      ORDER BY m.position ASC`,
  )
    .bind(billId)
    .all();
  const shares = (results ?? []).map((r) => mapShare(r as never));

  return c.json({ ...bill, shares });
});
