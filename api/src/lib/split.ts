/**
 * Integer-cent bill splitting with deterministic remainder allocation.
 *
 * The sum of shares is ALWAYS equal to the total. Remainder cents (which arise
 * when `total % memberCount != 0`) are distributed one cent at a time to the
 * first N members, where N = total % memberCount. This is deterministic and
 * stable across re-runs.
 *
 * Example: total = 1000 cents, members = 3
 *   base      = 333
 *   remainder = 1
 *   shares    = [334, 333, 333]   ->  sum = 1000 ✓
 */

/**
 * Split `totalCents` equally across `memberCount` members.
 *
 * @returns an array of integer-cent amounts, length === memberCount,
 *          whose sum === totalCents.
 *
 * @throws if memberCount < 1 or totalCents is not a safe positive integer.
 */
export function splitEqually(totalCents: number, memberCount: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new SplitError('total must be an integer (cents)');
  }
  if (totalCents <= 0) {
    throw new SplitError('total must be greater than zero');
  }
  if (!Number.isInteger(memberCount) || memberCount < 1) {
    throw new SplitError('memberCount must be a positive integer');
  }

  const base = Math.floor(totalCents / memberCount);
  const remainder = totalCents - base * memberCount; // 0 .. memberCount-1

  const shares = new Array<number>(memberCount).fill(base);
  for (let i = 0; i < remainder; i++) {
    shares[i] = (shares[i] ?? 0) + 1;
  }

  // Defensive invariant — never ship a split that does not sum to the total.
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum !== totalCents) {
    throw new SplitError(`split invariant violated: sum=${sum}, expected=${totalCents}`);
  }

  return shares;
}

/** Error thrown when splitting cannot be performed. */
export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}
