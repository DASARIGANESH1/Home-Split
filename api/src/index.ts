import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from './env';
import { HttpError, isHttpError } from './lib/errors';
import { ValidationError } from './lib/validation';
import { balancesRoute } from './routes/balances';
import { billsCreateRoute, billsFetchRoute } from './routes/bills';
import { homesRoute } from './routes/homes';
import { paymentsRoute } from './routes/payments';

import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

// --- middleware -----------------------------------------------------------
app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    exposeHeaders: ['Idempotency-Key'],
    maxAge: 600,
  }),
);

// --- health ---------------------------------------------------------------
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- routes ---------------------------------------------------------------
app.route('/api/homes', homesRoute); // POST /, POST /:homeId/members, GET /:homeId
app.route('/api/homes', billsCreateRoute); // POST /:homeId/bills
app.route('/api/bills', billsFetchRoute); // GET /:billId
app.route('/api/homes', balancesRoute); // GET /:homeId/balances
app.route('/api/bills', paymentsRoute); // POST /:billId/shares/:shareId/pay

// --- global error handler -------------------------------------------------
app.onError((err, c) => {
  // ValidationError -> 400
  if (err instanceof ValidationError) {
    return jsonError(c, 400, 'VALIDATION_ERROR', err.message);
  }
  // HttpError -> its own status
  if (isHttpError(err)) {
    return jsonError(c, err.status, err.code, err.message);
  }
  // D1 / SQLite constraint violations surfaced as 400 with no internal detail.
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('UNIQUE constraint failed')) {
    return jsonError(c, 409, 'CONSTRAINT_VIOLATION', 'a uniqueness constraint was violated');
  }
  if (msg.includes('CHECK constraint failed')) {
    return jsonError(c, 400, 'CONSTRAINT_VIOLATION', 'a check constraint was violated');
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return jsonError(c, 400, 'CONSTRAINT_VIOLATION', 'a referenced resource does not exist');
  }
  // Unknown — never leak internal stack traces to the client. Log server-side only.
  console.error('[unhandled]', err instanceof Error ? err.message : err);
  return jsonError(c, 500, 'INTERNAL_ERROR', 'an unexpected error occurred');
});

// --- 404 fallback ---------------------------------------------------------
app.notFound((c) =>
  jsonError(c, 404, 'NOT_FOUND', `route ${c.req.method} ${c.req.path} not found`),
);

function jsonError(
  c: Parameters<Parameters<typeof app.notFound>[0]>[0],
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return c.json({ error: code, message }, status);
}

export default app;
export { app };
