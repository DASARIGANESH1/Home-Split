/** Input validation helpers. Every value crossing the API boundary is validated here. */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Coerce and validate a "name" string field.
 * Accepts any value, requires a non-empty trimmed string within the length limit.
 */
export function validateName(value: unknown, field: string, maxLength = 100): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validate that the request body is a plain object (not null, not array).
 */
export function requireBody(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    throw new ValidationError('request body is required');
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/**
 * Validate a positive integer amount in cents.
 * Rejects: non-numbers, NaN, non-integers, Infinity, <= 0.
 */
export function validatePositiveAmountCents(value: unknown, field = 'totalAmount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`);
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer (cents) — decimals are not allowed`);
  }
  if (value <= 0) {
    throw new ValidationError(`${field} must be greater than zero`);
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError(`${field} is too large`);
  }
  return value;
}

/**
 * Validate the Idempotency-Key header. Must be a non-empty trimmed string,
 * reasonable length, no whitespace.
 */
export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Idempotency-Key header must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Idempotency-Key header must not be empty');
  }
  if (trimmed.length > 256) {
    throw new ValidationError('Idempotency-Key header is too long (max 256 chars)');
  }
  if (/\s/.test(trimmed)) {
    throw new ValidationError('Idempotency-Key header must not contain whitespace');
  }
  return trimmed;
}
