import { SELF, applyD1Migrations, env } from 'cloudflare:test';
import type { D1Database } from '@cloudflare/workers-types';
import { beforeAll, beforeEach } from 'vitest';

// `env` from `cloudflare:test` is the worker bindings object, populated by the
// vitest-pool-workers runtime. Resolve it lazily because it may not be set at
// module load time.
function db(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

beforeAll(async () => {
  // Apply migrations through the official helper. The `migrations` are read
  // from disk by the vitest config (`readD1Migrations`) and injected as a
  // binding named `__D1_MIGRATIONS` automatically when migrationsDir is set.
  const migrations = (env as unknown as { __D1_MIGRATIONS?: unknown[] }).__D1_MIGRATIONS;
  if (migrations) {
    await applyD1Migrations(db(), migrations as never, '_migrations');
  }
});

beforeEach(async () => {
  // Wipe all rows between tests so each test starts from a clean slate.
  await db().prepare('DELETE FROM idempotency_keys').run();
  await db().prepare('DELETE FROM shares').run();
  await db().prepare('DELETE FROM bills').run();
  await db().prepare('DELETE FROM members').run();
  await db().prepare('DELETE FROM homes').run();
});

/**
 * Issue a JSON request against the worker under test. `SELF` is provided by
 * `cloudflare:test` and is a fetcher bound to the worker entrypoint WITH the
 * env bindings — so `c.env.DB` inside handlers resolves correctly.
 */
export async function api(
  method: string,
  path: string,
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  return SELF.fetch(`http://localhost${path}`, { method, headers, body });
}

/** Fetch + parse JSON with a typed result. */
export async function apiJson<T = unknown>(
  method: string,
  path: string,
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<{ status: number; body: T }> {
  const res = await api(method, path, opts);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

export async function createHome(name = 'Apartment 4A'): Promise<{ id: string; name: string }> {
  const { status, body } = await apiJson<{ id: string; name: string }>('POST', '/api/homes', {
    body: { name },
  });
  if (status !== 201) throw new Error(`createHome failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export async function addMember(
  homeId: string,
  name: string,
): Promise<{ id: string; name: string; position: number }> {
  const { status, body } = await apiJson<{ id: string; name: string; position: number }>(
    'POST',
    `/api/homes/${homeId}/members`,
    { body: { name } },
  );
  if (status !== 201)
    throw new Error(`addMember(${name}) failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export interface BillResult {
  id: string;
  homeId: string;
  title: string;
  totalAmount: number;
  createdAt: string;
  shares: {
    id: string;
    billId: string;
    memberId: string;
    memberName: string;
    amount: number;
    paid: boolean;
    paidAt: string | null;
  }[];
}

export async function createBill(
  homeId: string,
  title: string,
  totalAmount: number,
): Promise<BillResult> {
  const { status, body } = await apiJson<BillResult>('POST', `/api/homes/${homeId}/bills`, {
    body: { title, totalAmount },
  });
  if (status !== 201) throw new Error(`createBill failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export interface ShareResult {
  id: string;
  billId: string;
  memberId: string;
  memberName: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
}

export async function payShare(
  billId: string,
  shareId: string,
  idempotencyKey: string,
): Promise<{ status: number; body: ShareResult & { error?: string; message?: string } }> {
  const res = await api('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    idempotencyKey,
  });
  return {
    status: res.status,
    body: (await res.json()) as ShareResult & { error?: string; message?: string },
  };
}
