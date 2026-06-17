type ClientPerfMeta = Record<string, string | number | boolean | null | undefined>;

function shouldLogClientPerf(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_PERF_LOGS === '1';
}

export function logClientTiming(label: string, durationMs: number, meta: ClientPerfMeta = {}) {
  if (!shouldLogClientPerf()) return;
  console.info('[ClientPerf]', JSON.stringify({
    label,
    duration_ms: Math.round(durationMs * 10) / 10,
    ...meta,
  }));
}
