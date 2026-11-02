import { describe, expect, it } from 'vitest';
import { SplitError, splitEqually } from '../src/lib/split';

describe('splitEqually', () => {
  it('splits evenly when divisible', () => {
    expect(splitEqually(900, 3)).toEqual([300, 300, 300]);
    expect(splitEqually(100, 5)).toEqual([20, 20, 20, 20, 20]);
  });

  it('allocates remainder cents to the first members', () => {
    // 1000 / 3 -> base 333, remainder 1 -> [334, 333, 333]
    const shares = splitEqually(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('handles 7 members with large uneven amount', () => {
    const total = 100_000; // 1000.00
    const shares = splitEqually(total, 7);
    expect(shares).toHaveLength(7);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    // base = 14285, remainder = 5 -> first 5 get +1
    const expected = [14286, 14286, 14286, 14286, 14286, 14285, 14285];
    expect(shares).toEqual(expected);
  });

  it('handles single member', () => {
    expect(splitEqually(12345, 1)).toEqual([12345]);
  });

  it('handles amount smaller than member count (e.g. 3 cents / 5 members)', () => {
    const shares = splitEqually(3, 5);
    expect(shares).toEqual([1, 1, 1, 0, 0]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('sum invariant holds for many random totals/member counts', () => {
    for (let m = 1; m <= 12; m++) {
      for (let t = 1; t <= 5000; t += 37) {
        const shares = splitEqually(t, m);
        const sum = shares.reduce((a, b) => a + b, 0);
        if (sum !== t) {
          throw new Error(`sum mismatch: total=${t} members=${m} sum=${sum}`);
        }
        // Each share differs from any other by at most 1 cent.
        const max = Math.max(...shares);
        const min = Math.min(...shares);
        if (max - min > 1) {
          throw new Error(`unbalanced split: total=${t} members=${m} max=${max} min=${min}`);
        }
      }
    }
  });

  it('rejects non-integer totals', () => {
    expect(() => splitEqually(10.5, 3)).toThrow(SplitError);
  });

  it('rejects zero or negative totals', () => {
    expect(() => splitEqually(0, 3)).toThrow(SplitError);
    expect(() => splitEqually(-5, 3)).toThrow(SplitError);
  });

  it('rejects non-positive member counts', () => {
    expect(() => splitEqually(100, 0)).toThrow(SplitError);
    expect(() => splitEqually(100, -1)).toThrow(SplitError);
    expect(() => splitEqually(100, 1.5)).toThrow(SplitError);
  });
});
