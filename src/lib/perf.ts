import 'server-only';

type PerfMeta = Record<string, string | number | boolean | null | undefined>;

function perfBucket(durationMs: number): string {
  if (durationMs < 50) return '<50ms';
  if (durationMs < 100) return '50-99ms';
  if (durationMs < 250) return '100-249ms';
  if (durationMs < 500) return '250-499ms';
  if (durationMs < 1000) return '500-999ms';
  return '1000ms+';
}

function shouldLogPerf(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_PERF_LOGS === '1';
}

export function logServerTiming(label: string, durationMs: number, meta: PerfMeta = {}) {
  if (!shouldLogPerf()) return;
  console.info('[Perf]', JSON.stringify({
    label,
    duration_ms: Math.round(durationMs * 10) / 10,
    duration_bucket: perfBucket(durationMs),
    ...meta,
  }));
}

export async function withServerTiming<T>(
  label: string,
  operation: () => Promise<T>,
  meta: PerfMeta = {},
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    logServerTiming(label, performance.now() - startedAt, meta);
  }
}
