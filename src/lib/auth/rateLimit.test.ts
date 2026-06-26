import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// rateLimit.ts uses module-level state (Map), so we need to reset between tests.
// We do this by calling clearRateLimit for known IPs, or by re-importing the module.
// The cleanest approach is to use the exported clearRateLimit helper and track IPs used.

import { checkRateLimit, recordFailedAttempt, clearRateLimit } from './rateLimit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers,
  });
}

function makeRequestWithIp(ip: string): Request {
  return makeRequest({ 'x-forwarded-for': ip });
}

/**
 * Drive an IP to exactly MAX_ATTEMPTS (5) recorded failures so the next
 * checkRateLimit call is blocked.
 */
function exhaustLimit(ip: string, attempts = 5): void {
  const req = makeRequestWithIp(ip);
  for (let i = 0; i < attempts; i++) {
    recordFailedAttempt(req);
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('rateLimit', () => {
  // We track every IP used so we can clean up after each test.
  const usedIps: string[] = [];

  function track(ip: string): string {
    usedIps.push(ip);
    return ip;
  }

  afterEach(() => {
    // Reset all IPs touched in this test
    for (const ip of usedIps) {
      clearRateLimit(makeRequestWithIp(ip));
    }
    usedIps.length = 0;

    // Also clean up requests without x-forwarded-for (they map to 'unknown')
    clearRateLimit(makeRequest());

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // checkRateLimit — basic allow/block behaviour
  // -------------------------------------------------------------------------

  describe('checkRateLimit', () => {
    it('allows the very first request from an IP (no prior attempts)', () => {
      const ip = track('1.1.1.1');
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
    });

    it('allows requests when attempt count is below the limit', () => {
      const ip = track('1.1.1.2');
      // Record 4 failures — still 1 below limit (limit is 5)
      exhaustLimit(ip, 4);
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
    });

    it('allows the request exactly at attempt count equal to MAX_ATTEMPTS - 1', () => {
      const ip = track('1.1.1.3');
      exhaustLimit(ip, 4); // 4 failures recorded, count < 5
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.allowed).toBe(true);
    });

    it('blocks the request when attempt count reaches MAX_ATTEMPTS (5)', () => {
      const ip = track('1.1.1.4');
      exhaustLimit(ip, 5); // now count === 5
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.allowed).toBe(false);
    });

    it('returns a positive retryAfterMs when blocked', () => {
      const ip = track('1.1.1.5');
      exhaustLimit(ip, 5);
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    });

    it('keeps blocking on subsequent calls once limit is reached', () => {
      const ip = track('1.1.1.6');
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('does not increment count itself — check is non-destructive', () => {
      const ip = track('1.1.1.7');
      // If checkRateLimit were incrementing, 5 checks would block the 6th.
      for (let i = 0; i < 10; i++) {
        checkRateLimit(makeRequestWithIp(ip));
      }
      // No recordFailedAttempt calls, so should still be allowed
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Different IPs tracked independently
  // -------------------------------------------------------------------------

  describe('IP isolation', () => {
    it('tracks different IPs independently — exhausting one does not affect another', () => {
      const exhaustedIp = track('2.2.2.1');
      const cleanIp = track('2.2.2.2');

      exhaustLimit(exhaustedIp, 5);

      // exhausted IP is blocked
      expect(checkRateLimit(makeRequestWithIp(exhaustedIp)).allowed).toBe(false);
      // clean IP is unaffected
      expect(checkRateLimit(makeRequestWithIp(cleanIp)).allowed).toBe(true);
    });

    it('both IPs can be blocked simultaneously without interfering', () => {
      const ip1 = track('2.2.2.3');
      const ip2 = track('2.2.2.4');

      exhaustLimit(ip1, 5);
      exhaustLimit(ip2, 5);

      expect(checkRateLimit(makeRequestWithIp(ip1)).allowed).toBe(false);
      expect(checkRateLimit(makeRequestWithIp(ip2)).allowed).toBe(false);
    });

    it('clearing one IP does not clear another', () => {
      const ip1 = track('2.2.2.5');
      const ip2 = track('2.2.2.6');

      exhaustLimit(ip1, 5);
      exhaustLimit(ip2, 5);

      clearRateLimit(makeRequestWithIp(ip1));

      expect(checkRateLimit(makeRequestWithIp(ip1)).allowed).toBe(true);
      expect(checkRateLimit(makeRequestWithIp(ip2)).allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Window expiry with fake timers
  // -------------------------------------------------------------------------

  describe('window expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('allows requests again after the window (60 s) expires', () => {
      const ip = track('3.3.3.1');
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);

      // Advance time past the 60-second window
      vi.advanceTimersByTime(60_001);

      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('resets bucket after window expiry — fresh count starts from zero', () => {
      const ip = track('3.3.3.2');
      exhaustLimit(ip, 5);

      vi.advanceTimersByTime(60_001);

      // After reset, record 4 failures — should still be allowed (not carried over)
      exhaustLimit(ip, 4);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('still blocks if still within the same window', () => {
      const ip = track('3.3.3.3');
      exhaustLimit(ip, 5);

      vi.advanceTimersByTime(59_999); // just under the window

      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('resets exactly at window boundary (WINDOW_MS elapsed)', () => {
      const ip = track('3.3.3.4');
      exhaustLimit(ip, 5);

      // Advance by exactly WINDOW_MS — the condition is (now - windowStart) > WINDOW_MS
      // so at exactly WINDOW_MS it is NOT yet expired (strict >)
      vi.advanceTimersByTime(60_000);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);

      // One millisecond past the window — now it should reset
      vi.advanceTimersByTime(1);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('retryAfterMs decreases as time passes within the window', () => {
      const ip = track('3.3.3.5');
      exhaustLimit(ip, 5);

      const first = checkRateLimit(makeRequestWithIp(ip)).retryAfterMs;
      vi.advanceTimersByTime(10_000);
      const second = checkRateLimit(makeRequestWithIp(ip)).retryAfterMs;

      expect(second).toBeLessThan(first);
      // Should be approximately 10 s less
      expect(first - second).toBeGreaterThanOrEqual(9_900);
      expect(first - second).toBeLessThanOrEqual(10_100);
    });

    it('burst from same IP in same window is correctly counted', () => {
      const ip = track('3.3.3.6');

      // Record 3 failures early in the window
      exhaustLimit(ip, 3);

      // Advance time slightly (still within window)
      vi.advanceTimersByTime(5_000);

      // Record 2 more failures — should now be at limit
      exhaustLimit(ip, 2);

      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('burst that straddles a window reset resets the counter', () => {
      const ip = track('3.3.3.7');

      // Exhaust 5 failures
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);

      // Pass the window
      vi.advanceTimersByTime(61_000);

      // Only 4 more failures in the new window — should still be allowed
      exhaustLimit(ip, 4);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // IP header extraction
  // -------------------------------------------------------------------------

  describe('IP header extraction', () => {
    it('uses x-forwarded-for when present', () => {
      const ip = track('4.4.4.1');
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('uses only the first IP when x-forwarded-for contains multiple IPs', () => {
      const firstIp = track('4.4.4.2');
      const secondIp = track('4.4.4.3');

      // Exhaust the first IP
      exhaustLimit(firstIp, 5);

      // A request with first IP in a comma-separated list should be blocked
      const multiReq = makeRequest({ 'x-forwarded-for': `${firstIp}, ${secondIp}` });
      expect(checkRateLimit(multiReq).allowed).toBe(false);
    });

    it('second IP in x-forwarded-for is not used as the key', () => {
      const firstIp = track('4.4.4.4');
      const secondIp = track('4.4.4.5');

      // Exhaust the second IP directly — no effect on multi-IP request keyed by first
      exhaustLimit(secondIp, 5);

      const multiReq = makeRequest({ 'x-forwarded-for': `${firstIp}, ${secondIp}` });
      expect(checkRateLimit(multiReq).allowed).toBe(true);
    });

    it('trims whitespace from the first IP in x-forwarded-for', () => {
      const ip = track('4.4.4.6');
      // Record failures via a request with a space before the IP
      const req1 = makeRequest({ 'x-forwarded-for': `  ${ip}  ` });
      for (let i = 0; i < 5; i++) recordFailedAttempt(req1);

      // Check via a clean request with the same IP
      const req2 = makeRequestWithIp(ip);
      expect(checkRateLimit(req2).allowed).toBe(false);
    });

    it('falls back to "unknown" when x-forwarded-for is absent', () => {
      // Requests without x-forwarded-for all share the "unknown" bucket.
      // We exhaust that bucket and verify a second no-header request is blocked.
      const noHeaderReq1 = makeRequest();
      for (let i = 0; i < 5; i++) recordFailedAttempt(noHeaderReq1);

      const noHeaderReq2 = makeRequest();
      expect(checkRateLimit(noHeaderReq2).allowed).toBe(false);
    });

    it('x-forwarded-for with single IP and no comma works correctly', () => {
      const ip = track('4.4.4.7');
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('empty x-forwarded-for header falls back gracefully (does not crash)', () => {
      // An empty string means forwarded is falsy-empty — let's see what getIp does:
      // forwarded = '' => falsy, so it should fall through to 'unknown'
      // Actually '' is falsy in JS, so the branch `if (forwarded)` is false.
      const req = makeRequest({ 'x-forwarded-for': '' });
      expect(() => checkRateLimit(req)).not.toThrow();
    });

    it('empty x-forwarded-for maps to "unknown" bucket (same as no header)', () => {
      // Both no-header and empty-header requests map to "unknown".
      const noHeaderReq = makeRequest();
      const emptyHeaderReq = makeRequest({ 'x-forwarded-for': '' });

      for (let i = 0; i < 5; i++) recordFailedAttempt(noHeaderReq);

      // Empty header should be blocked too since both map to "unknown"
      expect(checkRateLimit(emptyHeaderReq).allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // recordFailedAttempt
  // -------------------------------------------------------------------------

  describe('recordFailedAttempt', () => {
    it('increments count and blocks after MAX_ATTEMPTS recordings', () => {
      const ip = track('5.5.5.1');
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
        recordFailedAttempt(makeRequestWithIp(ip));
      }
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('does not block after only 4 recordFailedAttempt calls', () => {
      const ip = track('5.5.5.2');
      for (let i = 0; i < 4; i++) recordFailedAttempt(makeRequestWithIp(ip));
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('creates the bucket on first recordFailedAttempt call (IP previously unseen)', () => {
      const ip = track('5.5.5.3');
      // No prior interaction — just record
      expect(() => recordFailedAttempt(makeRequestWithIp(ip))).not.toThrow();
      // And the bucket now exists with count 1, so 4 more should block
      exhaustLimit(ip, 4);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
    });

    it('resets stale bucket on recordFailedAttempt after window expires', () => {
      vi.useFakeTimers();
      const ip = track('5.5.5.4');
      exhaustLimit(ip, 5);

      vi.advanceTimersByTime(61_000);

      // Recording a failure in new window resets count to 0 then increments to 1
      recordFailedAttempt(makeRequestWithIp(ip));
      // Only 1 attempt, so still allowed (need 4 more to block)
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // clearRateLimit
  // -------------------------------------------------------------------------

  describe('clearRateLimit', () => {
    it('clears the bucket and allows requests again', () => {
      const ip = track('6.6.6.1');
      exhaustLimit(ip, 5);
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);

      clearRateLimit(makeRequestWithIp(ip));
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('is a no-op for an IP that was never rate-limited', () => {
      const ip = track('6.6.6.2');
      expect(() => clearRateLimit(makeRequestWithIp(ip))).not.toThrow();
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });

    it('clears using the same IP extraction logic (first x-forwarded-for IP)', () => {
      const ip = track('6.6.6.3');
      exhaustLimit(ip, 5);

      // Clear using a multi-IP header — should still target the correct bucket
      clearRateLimit(makeRequest({ 'x-forwarded-for': `${ip}, 9.9.9.9` }));
      expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Boundary and edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles concurrent-style rapid checks for the same IP without crashing', () => {
      const ip = track('7.7.7.1');
      expect(() => {
        for (let i = 0; i < 20; i++) {
          checkRateLimit(makeRequestWithIp(ip));
          if (i < 10) recordFailedAttempt(makeRequestWithIp(ip));
        }
      }).not.toThrow();
    });

    it('does not allow negative retryAfterMs (always >= 0 when allowed)', () => {
      const ip = track('7.7.7.2');
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
    });

    it('retryAfterMs is 0 when request is allowed', () => {
      const ip = track('7.7.7.3');
      const result = checkRateLimit(makeRequestWithIp(ip));
      expect(result.retryAfterMs).toBe(0);
    });

    it('handles an IP that is just whitespace in x-forwarded-for', () => {
      // '   '.trim() === '' — split on comma gives ['   '], trim gives '' — which is the key
      const req = makeRequest({ 'x-forwarded-for': '   ' });
      expect(() => checkRateLimit(req)).not.toThrow();
      expect(() => recordFailedAttempt(req)).not.toThrow();
    });

    it('handles IPv6 address in x-forwarded-for', () => {
      const ipv6 = track('::1');
      exhaustLimit(ipv6, 5);
      expect(checkRateLimit(makeRequestWithIp(ipv6)).allowed).toBe(false);
    });

    it('handles IPv6 with port in x-forwarded-for without crashing', () => {
      const req = makeRequest({ 'x-forwarded-for': '[::1]:8080' });
      expect(() => checkRateLimit(req)).not.toThrow();
    });

    it('large number of different IPs do not interfere with each other', () => {
      const ips = Array.from({ length: 50 }, (_, i) => track(`10.0.${Math.floor(i / 255)}.${i % 255 + 1}`));

      // Exhaust every IP
      for (const ip of ips) exhaustLimit(ip, 5);

      // All blocked
      for (const ip of ips) {
        expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
      }

      // Clear the first half
      for (const ip of ips.slice(0, 25)) {
        clearRateLimit(makeRequestWithIp(ip));
      }

      // First half allowed, second half still blocked
      for (const ip of ips.slice(0, 25)) {
        expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(true);
      }
      for (const ip of ips.slice(25)) {
        expect(checkRateLimit(makeRequestWithIp(ip)).allowed).toBe(false);
      }
    });
  });
});
