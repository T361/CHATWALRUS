import { describe, it, expect } from 'vitest';
import { formatDate, formatShortDate, getMilestoneDays, getCurrentMilestoneDay } from './dates';

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    expect(formatDate('2024-01-15')).toBe('Jan 15, 2024');
  });

  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns em-dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('accepts a custom format', () => {
    expect(formatDate('2024-06-01', 'yyyy/MM/dd')).toBe('2024/06/01');
  });
});

describe('formatShortDate', () => {
  it('formats to short month + day', () => {
    expect(formatShortDate('2024-03-07')).toBe('Mar 7');
  });

  it('returns em-dash for null', () => {
    expect(formatShortDate(null)).toBe('—');
  });
});

describe('getMilestoneDays', () => {
  it('returns multiples of 30 up to maxDays', () => {
    expect(getMilestoneDays(90)).toEqual([30, 60, 90]);
  });

  it('defaults to 360 days (12 milestones)', () => {
    const result = getMilestoneDays();
    expect(result).toHaveLength(12);
    expect(result[0]).toBe(30);
    expect(result[11]).toBe(360);
  });

  it('returns empty array if maxDays is less than 30', () => {
    expect(getMilestoneDays(20)).toEqual([]);
  });
});

describe('getCurrentMilestoneDay', () => {
  it('returns 0 for null start date', () => {
    expect(getCurrentMilestoneDay(null)).toBe(0);
  });

  it('returns 0 for a very recent date (< 30 days)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getCurrentMilestoneDay(yesterday.toISOString())).toBe(0);
  });

  it('returns 30 for a date ~30-59 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 35);
    expect(getCurrentMilestoneDay(d.toISOString())).toBe(30);
  });

  it('returns 60 for a date ~60-89 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 65);
    expect(getCurrentMilestoneDay(d.toISOString())).toBe(60);
  });
});
