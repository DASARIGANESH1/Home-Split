import type { ApiError, Bill, Home, HomeBalances, HomeWithMembers, Member } from '../types';

/**
 * API client. All monetary values are integer cents. Errors are surfaced as
 * `ApiClientError` instances carrying an HTTP status, code, and message so the
 * UI can render meaningful feedback (loading / empty / 400 / 404 / 409 / 500 /
 * network failure) instead of crashing.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body });
  } catch (_e) {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection.',
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!res.ok) {
    const err = parsed as ApiError | null;
    throw new ApiClientError(
      res.status,
      err?.error ?? 'HTTP_ERROR',
      err?.message ?? `Request failed with status ${res.status}`,
    );
  }

  return parsed as T;
}

export const api = {
  // --- homes ---
  createHome: (name: string) => request<Home>('POST', '/api/homes', { body: { name } }),

  getHome: (homeId: string) => request<HomeWithMembers>('GET', `/api/homes/${homeId}`),

  // --- members ---
  addMember: (homeId: string, name: string) =>
    request<Member>('POST', `/api/homes/${homeId}/members`, { body: { name } }),

  // --- bills ---
  createBill: (homeId: string, title: string, totalAmount: number) =>
    request<Bill>('POST', `/api/homes/${homeId}/bills`, {
      body: { title, totalAmount },
    }),

  getBill: (billId: string) => request<Bill>('GET', `/api/bills/${billId}`),

  // --- payments ---
  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request<Bill['shares'][number]>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
      idempotencyKey,
    }),

  // --- balances ---
  getBalances: (homeId: string) => request<HomeBalances>('GET', `/api/homes/${homeId}/balances`),
};

/** Generate a fresh, random idempotency key for each "pay" intent. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `key_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Format integer cents as a currency string. */
export function formatCurrency(cents: number, currency = 'USD'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainderCents = abs % 100;
  const formattedDollars = dollars.toLocaleString('en-US');
  const centsStr = remainderCents.toString().padStart(2, '0');
  const symbol = currency === 'USD' ? '$' : '';
  return `${sign}${symbol}${formattedDollars}.${centsStr}`;
}

/** Format an ISO timestamp into a friendly date string. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Stable color from a string for avatar backgrounds. */
const AVATAR_COLORS = [
  '#10b981',
  '#0ea5e9',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
];
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#10b981';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
