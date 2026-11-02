import { Hono } from 'hono';
import type { Env } from '../env';
import { notFound } from '../lib/errors';
import type { HomeBalances, MemberBalance } from '../types';

export const balancesRoute = new Hono<{ Bindings: Env }>();

interface BalanceRow {
  member_id: string;
  member_name: string;
  total_share: number;
  paid_amount: number;
}

// ---------------------------------------------------------------------------
// GET /api/homes/:homeId/balances
//
// Returns each member's total share, amount paid, and outstanding balance, plus
// home-level totals. Paid shares are excluded from "outstanding".
// A single grouped query avoids N+1 and prevents cross-home leakage via the
// explicit `b.home_id = ?` predicate.
// ---------------------------------------------------------------------------
balancesRoute.get('/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId');

  const homeRow = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>();
  if (!homeRow) {
    throw notFound('HOME_NOT_FOUND', `home '${homeId}' was not found`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT
        m.id                AS member_id,
        m.name              AS member_name,
        COALESCE(SUM(s.amount), 0)                          AS total_share,
        COALESCE(SUM(CASE WHEN s.paid_at IS NOT NULL
                          THEN s.amount ELSE 0 END), 0)     AS paid_amount
       FROM members m
       LEFT JOIN shares  s ON s.member_id = m.id
       LEFT JOIN bills   b ON b.id         = s.bill_id AND b.home_id = m.home_id
      WHERE m.home_id = ?
      GROUP BY m.id, m.name, m.position
      ORDER BY m.position ASC`,
  )
    .bind(homeId)
    .all<BalanceRow>();

  const rows = results ?? [];

  const members: MemberBalance[] = rows.map((r) => ({
    memberId: r.member_id,
    memberName: r.member_name,
    totalShare: r.total_share,
    paidAmount: r.paid_amount,
    outstandingBalance: r.total_share - r.paid_amount,
  }));

  const totals = members.reduce(
    (acc, m) => {
      acc.totalBilled += m.totalShare;
      acc.totalPaid += m.paidAmount;
      acc.totalOutstanding += m.outstandingBalance;
      return acc;
    },
    { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 },
  );

  const body: HomeBalances = { homeId, members, totals };
  return c.json(body);
});
