'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const CHANNEL = 'chatwalrus_auth';

export function AuthSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const bc = new BroadcastChannel(CHANNEL);

    bc.onmessage = async (e) => {
      if (pathname === '/login') return;

      if (e.data?.type === 'LOGOUT') {
        window.location.assign('/login');
        return;
      }

      if (e.data?.type === 'PASSCODE_DELETED') {
        // A passcode was deleted by admin — check if our own session is still valid
        try {
          const res = await fetch('/api/auth/session-check', { credentials: 'same-origin' });
          const json = await res.json();
          if (!json.valid) {
            window.location.assign('/login?reason=session_expired');
          }
        } catch {
          // If the check itself fails, stay put and let the next navigation handle it
        }
      }
    };

    return () => bc.close();
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
