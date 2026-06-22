'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const CHANNEL = 'chatwalrus_auth';

export function AuthSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => {
      if (e.data?.type === 'LOGOUT' && pathname !== '/login') {
        window.location.assign('/login');
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
