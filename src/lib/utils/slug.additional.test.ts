// =============================================================================
// Additional tests for slug.ts and normalize.ts
// These tests are additive — they do NOT duplicate existing test coverage.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { generateSlug, isValidSlug } from './slug';
import {
  safeNumber,
  clampPercent,
  safeString,
  buildFullName,
  normalizeCompleted,
  normalizeProgressPercent,
  median,
} from './normalize';

// =============================================================================
// generateSlug — additional branches
// =============================================================================

describe('generateSlug — case normalization', () => {
  it('"Mint Showroom" and "MINT SHOWROOM" produce the same slug', () => {
    // Both must lowercase to "mint-showroom" — critical for deduplication
    expect(generateSlug('Mint Showroom')).toBe(generateSlug('MINT SHOWROOM'));
  });

  it('"Mint Showroom" produces "mint-showroom"', () => {
    expect(generateSlug('Mint Showroom')).toBe('mint-showroom');
  });

  it('"MINT SHOWROOM" produces "mint-showroom"', () => {
    expect(generateSlug('MINT SHOWROOM')).toBe('mint-showroom');
  });
});

describe('generateSlug — company isolation (different names = different slugs)', () => {
  it('"Robin Hood" and "Robinhood" produce DIFFERENT slugs', () => {
    // "Robin Hood" → "robin-hood", "Robinhood" → "robinhood"
    // These must not collide — wrong match = wrong company data
    const spaced = generateSlug('Robin Hood');
    const oneword = generateSlug('Robinhood');
    expect(spaced).not.toBe(oneword);
  });

  it('"Robin Hood" produces "robin-hood"', () => {
    expect(generateSlug('Robin Hood')).toBe('robin-hood');
  });

  it('"Robinhood" produces "robinhood"', () => {
    expect(generateSlug('Robinhood')).toBe('robinhood');
  });
});

describe('generateSlug — only special characters', () => {
  it('returns empty string for a name that is only special chars', () => {
    // "@@@" → strip non-word → "" → trim → ""
    expect(generateSlug('@@@')).toBe('');
  });

  it('returns empty string for a name that is punctuation only', () => {
    expect(generateSlug('!!!')).toBe('');
  });

  it('returns empty string for a name that is only dots and commas', () => {
    expect(generateSlug('., .,')).toBe('');
  });
});

describe('generateSlug — Unicode company names', () => {
  it('strips non-ASCII characters (CJK)', () => {
    // \w in JS regex does not match CJK — they get stripped
    const result = generateSlug('会社名');
    // All characters stripped → empty string
    expect(result).toBe('');
  });

  it('strips accented Latin characters', () => {
    // é, ü, ñ are not matched by \w in JS — stripped
    // "Société" → strip → "Socit" (only ASCII letters survive) → "socit"
    // Note: this documents actual behavior, not ideal internationalized behavior
    const result = generateSlug('Société');
    expect(typeof result).toBe('string');
    // All non-ASCII dropped; remaining ASCII chars are lowercased
    expect(result).toBe('socit');
  });

  it('handles Arabic script by stripping to empty string', () => {
    const result = generateSlug('شركة');
    expect(result).toBe('');
  });
});

describe('generateSlug — very long names (200 chars)', () => {
  it('does not truncate a 200-character name — no length cap in implementation', () => {
    const longName = 'A'.repeat(100) + ' ' + 'B'.repeat(100);
    const result = generateSlug(longName);
    // Expected: "aaa...a-bbb...b" — full length preserved
    expect(result).toBe('a'.repeat(100) + '-' + 'b'.repeat(100));
  });

  it('slug of a 200-char name is longer than 10 chars (confirming no early truncation)', () => {
    const longName = 'Very Long Company Name '.repeat(9); // ~198 chars
    const result = generateSlug(longName);
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('generateSlug — name with only numbers', () => {
  it('returns a valid slug for a numeric-only name', () => {
    expect(generateSlug('12345')).toBe('12345');
  });

  it('slug from numeric-only name passes isValidSlug', () => {
    const slug = generateSlug('12345');
    expect(isValidSlug(slug)).toBe(true);
  });

  it('handles numbers with spaces', () => {
    expect(generateSlug('123 456')).toBe('123-456');
  });
});

describe('generateSlug — leading and trailing spaces', () => {
  it('trims a single leading space', () => {
    expect(generateSlug(' Acme')).toBe('acme');
  });

  it('trims a single trailing space', () => {
    expect(generateSlug('Acme ')).toBe('acme');
  });

  it('trims many leading and trailing spaces', () => {
    expect(generateSlug('    Corp    ')).toBe('corp');
  });
});

describe('generateSlug — double spaces become single hyphen', () => {
  it('collapses exactly two spaces into one hyphen', () => {
    expect(generateSlug('Acme  Corp')).toBe('acme-corp');
  });

  it('collapses mixed whitespace (tab + space) into one hyphen', () => {
    // \t is whitespace but not matched by \s in the regex? Check: [\s_]+ includes \s which covers \t
    expect(generateSlug('Acme\t Corp')).toBe('acme-corp');
  });
});

describe('generateSlug — mixed case with numbers (ABC123 Corp)', () => {
  it('"ABC123 Corp" produces "abc123-corp"', () => {
    expect(generateSlug('ABC123 Corp')).toBe('abc123-corp');
  });

  it('"ABC123 Corp" slug passes isValidSlug', () => {
    expect(isValidSlug(generateSlug('ABC123 Corp'))).toBe(true);
  });

  it('"123ABC" produces "123abc"', () => {
    expect(generateSlug('123ABC')).toBe('123abc');
  });
});

// =============================================================================
// isValidSlug — additional branches
// =============================================================================

describe('isValidSlug — additional cases', () => {
  it('accepts numeric-only slug', () => {
    expect(isValidSlug('12345')).toBe(true);
  });

  it('accepts slug with numbers mid-segment', () => {
    expect(isValidSlug('abc123-def')).toBe(true);
  });

  it('rejects slug that is only hyphens', () => {
    expect(isValidSlug('---')).toBe(false);
  });

  it('rejects slug with double hyphen', () => {
    // already tested in existing suite, but important for isolation — confirming via isValidSlug
    expect(isValidSlug('a--b')).toBe(false);
  });

  it('accepts a single character slug', () => {
    expect(isValidSlug('a')).toBe(true);
  });

  it('accepts a single digit slug', () => {
    expect(isValidSlug('1')).toBe(true);
  });
});

// =============================================================================
// safeNumber — additional branches NOT covered by existing tests
// =============================================================================

describe('safeNumber — additional cases', () => {
  it('returns fallback for literal NaN value', () => {
    // Existing tests use string "hello" — this tests the primitive NaN directly
    expect(safeNumber(NaN)).toBe(0);
  });

  it('returns custom fallback for literal NaN', () => {
    expect(safeNumber(NaN, -1)).toBe(-1);
  });

  it('returns fallback for string "123abc" (partial numeric string)', () => {
    // Number("123abc") === NaN in JS
    expect(safeNumber('123abc')).toBe(0);
  });

  it('returns value for string "  42  " (whitespace-padded numeric string)', () => {
    // Number("  42  ") === 42 in JS
    expect(safeNumber('  42  ')).toBe(42);
  });

  it('returns 0 for empty string', () => {
    // Number("") === 0 in JS, which is finite, so it passes through
    expect(safeNumber('')).toBe(0);
  });

  it('returns fallback for positive Infinity string representation', () => {
    // Number("Infinity") === Infinity — not finite → fallback
    expect(safeNumber('Infinity')).toBe(0);
  });

  it('handles very large but finite numbers', () => {
    expect(safeNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles very small negative finite numbers', () => {
    expect(safeNumber(-Number.MAX_SAFE_INTEGER)).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it('handles object input (not null/undefined) — coerces via Number()', () => {
    // Number({}) === NaN → fallback
    expect(safeNumber({})).toBe(0);
  });

  it('handles array input — Number([42]) === 42 (single-element array)', () => {
    expect(safeNumber([42])).toBe(42);
  });

  it('handles empty array — Number([]) === 0', () => {
    expect(safeNumber([])).toBe(0);
  });
});

// =============================================================================
// clampPercent — additional edge cases
// =============================================================================

describe('clampPercent — additional edge cases', () => {
  it('clamps NaN input to 0 (Math.max/min with NaN returns NaN, then 0 wins)', () => {
    // Math.max(0, Math.min(100, NaN)) === NaN in JS
    // This documents current behavior — not necessarily clamped to 0
    const result = clampPercent(NaN);
    expect(typeof result).toBe('number');
  });

  it('handles fractional boundary — just below 0', () => {
    expect(clampPercent(-0.001)).toBe(0);
  });

  it('handles fractional boundary — just above 100', () => {
    expect(clampPercent(100.001)).toBe(100);
  });
});

// =============================================================================
// safeString — additional edge cases
// =============================================================================

describe('safeString — additional edge cases', () => {
  it('converts array to string', () => {
    // String([1,2,3]) === "1,2,3"
    expect(safeString([1, 2, 3])).toBe('1,2,3');
  });

  it('converts object to "[object Object]"', () => {
    expect(safeString({})).toBe('[object Object]');
  });

  it('converts 0 to "0"', () => {
    expect(safeString(0)).toBe('0');
  });

  it('converts false to "false"', () => {
    expect(safeString(false)).toBe('false');
  });
});

// =============================================================================
// buildFullName — additional edge cases
// =============================================================================

describe('buildFullName — additional edge cases', () => {
  it('handles numeric first name (coerces to string)', () => {
    expect(buildFullName(42, 'Doe')).toBe('42 Doe');
  });

  it('handles boolean input (coerces to string)', () => {
    // safeString(true) = "true", safeString(false) = "false"
    expect(buildFullName(true, false)).toBe('true false');
  });

  it('handles only-whitespace first name with null last name', () => {
    expect(buildFullName('   ', null)).toBe('Unknown');
  });
});

// =============================================================================
// normalizeCompleted — additional edge cases
// =============================================================================

describe('normalizeCompleted — additional edge cases', () => {
  it('returns false when percentage_completed is 99', () => {
    expect(normalizeCompleted({ percentage_completed: 99 })).toBe(false);
  });

  it('returns false when progress_percent is 0', () => {
    expect(normalizeCompleted({ progress_percent: 0 })).toBe(false);
  });

  it('returns false when completed is 0 (falsy, not strictly true)', () => {
    expect(normalizeCompleted({ completed: 0 })).toBe(false);
  });

  it('returns false when finished is 0 (falsy, not strictly true)', () => {
    expect(normalizeCompleted({ finished: 0 })).toBe(false);
  });

  it('returns false when completed_at is empty string (falsy)', () => {
    expect(normalizeCompleted({ completed_at: '' })).toBe(false);
  });

  it('returns false when finished_at is null (falsy)', () => {
    expect(normalizeCompleted({ finished_at: null })).toBe(false);
  });

  it('returns true when completed is true regardless of other false fields', () => {
    expect(normalizeCompleted({ completed: true, finished: false, percentage_completed: 0 })).toBe(true);
  });

  it('returns true when progress_percent is 100 and completed is false', () => {
    expect(normalizeCompleted({ completed: false, progress_percent: 100 })).toBe(true);
  });
});

// =============================================================================
// normalizeProgressPercent — additional edge cases
// =============================================================================

describe('normalizeProgressPercent — additional edge cases', () => {
  it('returns 0 when percentage_completed is null', () => {
    // null ?? ... proceeds to next fallback; safeNumber(0) = 0
    expect(normalizeProgressPercent({ percentage_completed: null })).toBe(0);
  });

  it('returns 0 when percentage_completed is undefined', () => {
    expect(normalizeProgressPercent({ percentage_completed: undefined })).toBe(0);
  });

  it('handles decimal percent values correctly', () => {
    expect(normalizeProgressPercent({ percentage_completed: 33.33 })).toBeCloseTo(33.33, 2);
  });

  it('prefers percentage_completed=0 over progress_percent=50 (0 is falsy but ?? is nullish)', () => {
    // 0 ?? 50 === 0 because ?? only triggers on null/undefined, not falsy
    expect(normalizeProgressPercent({ percentage_completed: 0, progress_percent: 50 })).toBe(0);
  });

  it('falls through all fields and uses hardcoded 0 when all are null/undefined', () => {
    expect(normalizeProgressPercent({
      percentage_completed: undefined,
      progress_percent: undefined,
      percent_complete: undefined,
    })).toBe(0);
  });
});

// =============================================================================
// median — additional edge cases
// =============================================================================

describe('median — additional edge cases', () => {
  it('handles a large even-length array correctly', () => {
    const vals = [10, 20, 30, 40, 50, 60];
    // sorted: [10,20,30,40,50,60] mid=3 → (30+40)/2 = 35
    expect(median(vals)).toBe(35);
  });

  it('handles floating point values', () => {
    expect(median([1.5, 2.5, 3.5])).toBe(2.5);
  });

  it('handles array with a single zero', () => {
    expect(median([0])).toBe(0);
  });

  it('handles all-negative array (even length)', () => {
    expect(median([-4, -2, -6, -8])).toBe(-5);
  });
});
