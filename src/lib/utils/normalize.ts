// =============================================================================
// Normalization Utilities
// =============================================================================

/**
 * Safely parse a numeric value, returning a fallback if invalid.
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num;
}

/**
 * Clamp a numeric value to a percentage range [0, 100].
 */
export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Safely get a string value.
 */
export function safeString(value: unknown, fallback: string = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/**
 * Build a full name from first and last name parts.
 */
export function buildFullName(firstName: unknown, lastName: unknown): string {
  const first = safeString(firstName).trim();
  const last = safeString(lastName).trim();
  if (first && last) return `${first} ${last}`;
  return first || last || 'Unknown';
}

/**
 * Normalize a Thinkific completion field.
 * Thinkific may use completed, finished, or completed_at to indicate completion.
 */
export function normalizeCompleted(raw: Record<string, unknown>): boolean {
  if (raw.completed === true || raw.finished === true) return true;
  if (raw.completed_at || raw.finished_at) return true;
  if (raw.percentage_completed === 100 || raw.progress_percent === 100) return true;
  return false;
}

/**
 * Normalize a Thinkific progress percent field.
 */
export function normalizeProgressPercent(raw: Record<string, unknown>): number {
  const percent = safeNumber(
    raw.percentage_completed ?? raw.progress_percent ?? raw.percent_complete ?? 0
  );
  return clampPercent(percent);
}

/**
 * Calculate median from an array of numbers.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
