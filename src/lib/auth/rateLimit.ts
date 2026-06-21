// In-memory rate limiter for auth endpoints.
// Tracks failed attempts per IP; auto-clears entries older than the window.

const WINDOW_MS   = 60_000; // 1 minute
const MAX_ATTEMPTS = 5;      // failed attempts before lockout

interface Bucket {
  count:     number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function getIp(req: Request): string {
  const forwarded = (req.headers as Headers).get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

export function checkRateLimit(req: Request): { allowed: boolean; retryAfterMs: number } {
  const ip  = getIp(req);
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(ip, bucket);
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordFailedAttempt(req: Request): void {
  const ip  = getIp(req);
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;
}

export function clearRateLimit(req: Request): void {
  buckets.delete(getIp(req));
}
