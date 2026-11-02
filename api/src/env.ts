import type { D1Database } from '@cloudflare/workers-types';

/**
 * Environment bindings injected by the Workers runtime.
 * `DB` is a Cloudflare D1 database binding declared in wrangler.jsonc.
 */
export interface Env {
  DB: D1Database;
  /** Optional CORS allow-origin override. Defaults to '*'. */
  CORS_ORIGIN?: string;
  /** Runtime environment name, e.g. "production" / "preview". */
  ENVIRONMENT?: string;
}
