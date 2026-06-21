import { describe, it, expect } from 'vitest';
import {
  safeNumber,
  clampPercent,
  safeString,
  buildFullName,
  normalizeCompleted,
  normalizeProgressPercent,
  median,
} from './normalize';

describe('safeNumber', () => {
  it('converts numeric string to number', () => {
    expect(safeNumber('42')).toBe(42);
  });

  it('returns the number as-is', () => {
    expect(safeNumber(3.14)).toBe(3.14);
  });

  it('returns fallback for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns fallback for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns fallback for NaN string', () => {
    expect(safeNumber('hello')).toBe(0);
  });

  it('returns fallback for Infinity', () => {
    expect(safeNumber(Infinity)).toBe(0);
  });

  it('returns fallback for -Infinity', () => {
    expect(safeNumber(-Infinity)).toBe(0);
  });

  it('uses custom fallback', () => {
    expect(safeNumber(null, -1)).toBe(-1);
  });

  it('returns 0 for false (coerces to 0)', () => {
    expect(safeNumber(false)).toBe(0);
  });

  it('returns 1 for true (coerces to 1)', () => {
    expect(safeNumber(true)).toBe(1);
  });

  it('handles numeric 0 correctly', () => {
    expect(safeNumber(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(safeNumber(-5)).toBe(-5);
  });
});

describe('clampPercent', () => {
  it('returns value within range as-is', () => {
    expect(clampPercent(50)).toBe(50);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampPercent(-10)).toBe(0);
  });

  it('clamps values above 100 to 100', () => {
    expect(clampPercent(150)).toBe(100);
  });

  it('returns 0 for exactly 0', () => {
    expect(clampPercent(0)).toBe(0);
  });

  it('returns 100 for exactly 100', () => {
    expect(clampPercent(100)).toBe(100);
  });

  it('handles decimal values', () => {
    expect(clampPercent(75.5)).toBe(75.5);
  });
});

describe('safeString', () => {
  it('returns string as-is', () => {
    expect(safeString('hello')).toBe('hello');
  });

  it('returns fallback for null', () => {
    expect(safeString(null)).toBe('');
  });

  it('returns fallback for undefined', () => {
    expect(safeString(undefined)).toBe('');
  });

  it('converts number to string', () => {
    expect(safeString(42)).toBe('42');
  });

  it('converts boolean to string', () => {
    expect(safeString(true)).toBe('true');
  });

  it('uses custom fallback', () => {
    expect(safeString(null, 'N/A')).toBe('N/A');
  });

  it('returns empty string for empty string input', () => {
    expect(safeString('')).toBe('');
  });
});

describe('buildFullName', () => {
  it('combines first and last name', () => {
    expect(buildFullName('John', 'Doe')).toBe('John Doe');
  });

  it('returns first name when last is null', () => {
    expect(buildFullName('John', null)).toBe('John');
  });

  it('returns last name when first is null', () => {
    expect(buildFullName(null, 'Doe')).toBe('Doe');
  });

  it('returns "Unknown" when both are null', () => {
    expect(buildFullName(null, null)).toBe('Unknown');
  });

  it('returns "Unknown" when both are empty strings', () => {
    expect(buildFullName('', '')).toBe('Unknown');
  });

  it('returns "Unknown" when both are undefined', () => {
    expect(buildFullName(undefined, undefined)).toBe('Unknown');
  });

  it('trims whitespace from names', () => {
    expect(buildFullName('  John  ', '  Doe  ')).toBe('John Doe');
  });

  it('returns only non-empty part when one is whitespace', () => {
    expect(buildFullName('   ', 'Doe')).toBe('Doe');
  });
});

describe('normalizeCompleted', () => {
  it('returns true when completed is true', () => {
    expect(normalizeCompleted({ completed: true })).toBe(true);
  });

  it('returns true when finished is true', () => {
    expect(normalizeCompleted({ finished: true })).toBe(true);
  });

  it('returns true when completed_at is set', () => {
    expect(normalizeCompleted({ completed_at: '2024-01-01T00:00:00Z' })).toBe(true);
  });

  it('returns true when finished_at is set', () => {
    expect(normalizeCompleted({ finished_at: '2024-01-01T00:00:00Z' })).toBe(true);
  });

  it('returns true when percentage_completed is 100', () => {
    expect(normalizeCompleted({ percentage_completed: 100 })).toBe(true);
  });

  it('returns true when progress_percent is 100', () => {
    expect(normalizeCompleted({ progress_percent: 100 })).toBe(true);
  });

  it('returns false when completed is false', () => {
    expect(normalizeCompleted({ completed: false })).toBe(false);
  });

  it('returns false when no relevant fields are set', () => {
    expect(normalizeCompleted({})).toBe(false);
  });

  it('returns false when percentage_completed is 50', () => {
    expect(normalizeCompleted({ percentage_completed: 50 })).toBe(false);
  });

  it('returns false when completed is null', () => {
    expect(normalizeCompleted({ completed: null })).toBe(false);
  });
});

describe('normalizeProgressPercent', () => {
  it('returns percentage_completed when present', () => {
    expect(normalizeProgressPercent({ percentage_completed: 75 })).toBe(75);
  });

  it('falls back to progress_percent when percentage_completed is absent', () => {
    expect(normalizeProgressPercent({ progress_percent: 60 })).toBe(60);
  });

  it('falls back to percent_complete', () => {
    expect(normalizeProgressPercent({ percent_complete: 40 })).toBe(40);
  });

  it('returns 0 when no percent field is present', () => {
    expect(normalizeProgressPercent({})).toBe(0);
  });

  it('clamps to 100 when over 100', () => {
    expect(normalizeProgressPercent({ percentage_completed: 150 })).toBe(100);
  });

  it('clamps to 0 when negative', () => {
    expect(normalizeProgressPercent({ percentage_completed: -10 })).toBe(0);
  });

  it('prefers percentage_completed over progress_percent', () => {
    expect(normalizeProgressPercent({ percentage_completed: 80, progress_percent: 50 })).toBe(80);
  });
});

describe('median', () => {
  it('returns null for empty array', () => {
    expect(median([])).toBeNull();
  });

  it('returns the only element for single-element array', () => {
    expect(median([5])).toBe(5);
  });

  it('returns middle element for odd-length array', () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('sorts values before computing median', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('handles negative numbers', () => {
    expect(median([-3, -1, -2])).toBe(-2);
  });

  it('handles duplicate values', () => {
    expect(median([2, 2, 2, 2])).toBe(2);
  });

  it('handles two-element array', () => {
    expect(median([4, 6])).toBe(5);
  });

  it('does not mutate the original array', () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});
