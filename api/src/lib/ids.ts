/**
 * URL-safe ID generator. Uses Web Crypto (available in the Workers runtime and
 * in Node 20+). Returns a 21-character ID with ~120 bits of entropy — the same
 * format as NanoID's default alphabet.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnopqrstuvwxyz';
const ID_LENGTH = 21;

export function generateId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    const byte = bytes[i] ?? 0;
    const idx = byte % ALPHABET.length;
    out += ALPHABET[idx] ?? '';
  }
  return out;
}

/** Prefix helper for human-readable IDs in logs. */
export function prefixedId(prefix: string): string {
  return `${prefix}_${generateId()}`;
}
