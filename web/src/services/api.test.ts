import { describe, expect, it } from 'vitest';
import { avatarColor, formatCurrency, formatDate, initials, newIdempotencyKey } from './api';

describe('formatCurrency', () => {
  it('formats whole-dollar amounts', () => {
    expect(formatCurrency(1000)).toBe('$10.00');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats cents correctly', () => {
    expect(formatCurrency(1050)).toBe('$10.50');
    expect(formatCurrency(1)).toBe('$0.01');
    expect(formatCurrency(99)).toBe('$0.99');
  });

  it('formats negative amounts with a leading minus', () => {
    expect(formatCurrency(-500)).toBe('-$5.00');
  });

  it('formats large amounts with thousands separators', () => {
    expect(formatCurrency(123456789)).toBe('$1,234,567.89');
  });
});

describe('initials', () => {
  it('returns first two letters for a single name', () => {
    expect(initials('Alice')).toBe('AL');
  });
  it('returns first letters of first and last name', () => {
    expect(initials('Alice Wonderland')).toBe('AW');
  });
  it('returns ? for empty string', () => {
    expect(initials('')).toBe('?');
  });
  it('trims whitespace first', () => {
    expect(initials('  Bob   Smith  ')).toBe('BS');
  });
});

describe('avatarColor', () => {
  it('returns a hex color for any string', () => {
    expect(avatarColor('Alice')).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('returns the same color for the same name', () => {
    expect(avatarColor('Alice')).toBe(avatarColor('Alice'));
  });
});

describe('formatDate', () => {
  it('formats an ISO string', () => {
    const d = new Date('2025-01-15T10:30:00.000Z');
    const out = formatDate(d.toISOString());
    expect(out).toMatch(/2025/);
  });
  it('returns the input unchanged for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('newIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    const k = newIdempotencyKey();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(5);
  });
  it('returns unique values across calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
  });
});
