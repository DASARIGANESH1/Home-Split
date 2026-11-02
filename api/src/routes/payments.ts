import { Hono } from 'hono';
import type { Env } from '../env';
import { conflict, notFound } from '../lib/errors';
import { mapShare } from '../lib/mappers';
import { validateIdempotencyKey } from '../lib/validation';
import type { Share } from '../types';

export const paymentsRoute = new Hono<{ Bindings: Env }>();

interface ShareStateRow {
  id: string;
  bill_id: string;
  member_id: string;
  member_name: string;
  amount: number;
  paid_at: string | null;
  paid_idempotency_key: string | null;
}

interface IdempotencyRecordRow {
  key: string;
  share_id: string;
  response_status: number;
  response_body: string;
}

// ---------------------------------------------------------------------------
// POST /api/bills/:billId/shares/:shareId/pay
//
// Concurrency & idempotency strategy (see README § Idempotency for full detail):
//
//   1. Validate the Idempotency-Key header.
//   2. Try a conditional UPDATE that claims the share only if unpaid:
//        UPDATE shares SET paid_at = ?, paid_idempotency_key = ?
//         WHERE id = ? AND bill_id = ? AND paid_at IS NULL
//      This is the single atomic claim — SQLite/D1 serialises it. Exactly one
//      concurrent request can win (meta.changes === 1); every other request
//      for the same share sees meta.changes === 0.
//   3. If we won the claim:
//        - Persist an idempotency record with the canonical response body.
//        - Return 200 with the paid share.
//   4. If we lost the claim (share already paid):
//        - If paid_idempotency_key === request key  -> replay stored response
//          (or reconstruct from share state if the record is not yet visible
//          in the tightest race window).
//        - If paid_idempotency_key !== request key  -> 409 Conflict.
//   5. If the share / bill does not exist or the bill-share relationship is
//      invalid -> 404.
// ---------------------------------------------------------------------------
paymentsRoute.post('/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId');
  const shareId = c.req.param('shareId');
  const idempotencyKey = validateIdempotencyKey(c.req.header('Idempotency-Key'));
  const now = new Date().toISOString();

  // Step 2 — atomic conditional claim.
  let claim: { meta: { changes: number } };
  try {
    claim = await c.env.DB.prepare(
      `UPDATE shares
          SET paid_at = ?, paid_idempotency_key = ?
        WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
    )
      .bind(now, idempotencyKey, shareId, billId)
      .run();
  } catch (err) {
    // A UNIQUE violation on paid_idempotency_key means this key was already
    // used to pay a DIFFERENT share. The share was NOT paid (the UPDATE failed).
    // Return a clear 409 so the client knows the key is reused.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE') && msg.includes('paid_idempotency_key')) {
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        `idempotency key '${idempotencyKey}' was already used for a different share`,
      );
    }
    throw err;
  }

  if (claim.meta.changes === 1) {
    // We won. Build the canonical success response and persist it.
    const state = await fetchShareState(c.env, billId, shareId);
    if (!state) {
      // Should be impossible (we just updated the row), but guard anyway.
      throw notFound('SHARE_NOT_FOUND', `share '${shareId}' was not found`);
    }
    const share = mapShare(state);
    const responseBody = JSON.stringify(share);

    try {
      await c.env.DB.prepare(
        `INSERT INTO idempotency_keys (key, share_id, response_status, response_body, created_at)
         VALUES (?, ?, 200, ?, ?)`,
      )
        .bind(idempotencyKey, shareId, responseBody, now)
        .run();
    } catch (err) {
      // A concurrent request with the SAME key already inserted a record.
      // That can only happen if it also won the UPDATE — but only one request
      // can win the UPDATE. So this branch is unreachable in correct use;
      // if it ever fires, the stored record is authoritative and we return it.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('UNIQUE')) throw err;
    }

    return c.json(share, 200);
  }

  // Step 4 — we lost the claim. Inspect current state to decide replay/conflict.
  const state = await fetchShareState(c.env, billId, shareId);
  if (!state) {
    throw notFound('SHARE_NOT_FOUND', `share '${shareId}' on bill '${billId}' was not found`);
  }

  if (state.paid_idempotency_key === idempotencyKey) {
    // Same key — idempotent replay. Prefer the stored canonical response.
    const record = await c.env.DB.prepare('SELECT * FROM idempotency_keys WHERE key = ?')
      .bind(idempotencyKey)
      .first<IdempotencyRecordRow>();

    if (record) {
      const body = JSON.parse(record.response_body) as Share;
      return c.json(body, record.response_status as 200);
    }
    // Tightest race: the winner updated paid_at but has not yet inserted the
    // idempotency record. Reconstruct an equivalent success response from the
    // share's current paid state — same shape, same semantics.
    return c.json(mapShare(state), 200);
  }

  // Different key on an already-paid share -> conflict.
  throw conflict(
    'SHARE_ALREADY_PAID',
    `share '${shareId}' has already been paid with a different idempotency key`,
  );
});

/** Fetch a share joined with its bill + member, validating the bill-share relationship. */
async function fetchShareState(
  env: Env,
  billId: string,
  shareId: string,
): Promise<ShareStateRow | null> {
  const row = await env.DB.prepare(
    `SELECT s.id, s.bill_id, s.member_id, m.name AS member_name, s.amount,
            s.paid_at, s.paid_idempotency_key
       FROM shares s
       JOIN members m ON m.id = s.member_id
      WHERE s.id = ? AND s.bill_id = ?`,
  )
    .bind(shareId, billId)
    .first<ShareStateRow>();
  return row ?? null;
}
