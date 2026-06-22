'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const CHANNEL = 'chatwalrus_auth';

async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session-check', { credentials: 'same-origin' });
    const json = await res.json();
    return !!json.valid;
  } catch {
    return true; // network error — don't kick on flaky connection
  }
}

export function AuthSync() {
  const pathname = usePathname();

  // ── Same-browser cross-tab: BroadcastChannel ───────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    if (pathname === '/login') return;

    const bc = new BroadcastChannel(CHANNEL);

    bc.onmessage = async (e) => {
      if (e.data?.type === 'LOGOUT') {
        window.location.assign('/login');
        return;
      }
      if (e.data?.type === 'PASSCODE_DELETED') {
        const valid = await checkSession();
        if (!valid) window.location.assign('/login?reason=session_expired');
      }
    };

    return () => bc.close();
  }, [pathname]);

  // ── Cross-device: poll every 30 s on company pages ─────────────────────
  useEffect(() => {
    if (pathname === '/login' || !pathname.startsWith('/company/')) return;

    async function poll() {
      const valid = await checkSession();
      if (!valid) window.location.assign('/login?reason=session_expired');
    }

    // Check immediately when the tab regains focus (covers the
    // "admin deleted on another device, user switches back to this tab" case)
    function onVisible() {
      if (!document.hidden) poll();
    }
    document.addEventListener('visibilitychange', onVisible);

    const interval = setInterval(poll, 30_000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  return null;
}

/** Call after a successful logout fetch to kick all other tabs */
export function broadcastLogout() {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const bc = new BroadcastChannel(CHANNEL);
  bc.postMessage({ type: 'LOGOUT' });
  bc.close();
}

/** Call after a passcode is deleted so company tabs check their sessions */
export function broadcastPasscodeDeleted() {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const bc = new BroadcastChannel(CHANNEL);
  bc.postMessage({ type: 'PASSCODE_DELETED' });
  bc.close();
}
