// =============================================================================
// Date Utilities
// =============================================================================

import { differenceInDays, format, parseISO, isValid } from 'date-fns';

/**
 * Calculate the number of days since a given start date.
 */
export function daysSince(startDate: string | Date | null): number {
  if (!startDate) return 0;
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  if (!isValid(start)) return 0;
  return Math.max(0, differenceInDays(new Date(), start));
}

/**
 * Calculate the current milestone day (nearest 30-day interval).
 */
export function getCurrentMilestoneDay(startDate: string | Date | null): number {
  const days = daysSince(startDate);
  return Math.floor(days / 30) * 30;
}

/**
 * Get all milestone days up to a given maximum.
 */
export function getMilestoneDays(maxDays: number = 360): number[] {
  const days: number[] = [];
  for (let d = 30; d <= maxDays; d += 30) {
    days.push(d);
  }
  return days;
}

/**
 * Format a date string for display.
 */
export function formatDate(date: string | null, fmt: string = 'MMM d, yyyy'): string {
  if (!date) return '—';
  try {
    const parsed = parseISO(date);
    if (!isValid(parsed)) return '—';
    return format(parsed, fmt);
  } catch {
    return '—';
  }
}

/**
 * Format a date for short display.
 */
export function formatShortDate(date: string | null): string {
  return formatDate(date, 'MMM d');
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
