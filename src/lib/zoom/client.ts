// =============================================================================
// Zoom API Client (SERVER ONLY)
// =============================================================================

import type { ZoomTokenResponse } from '@/types/zoom';

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isZoomConfigured(): boolean {
  return !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}

export async function getZoomToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('[Zoom] Missing credentials.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`[Zoom] OAuth failed: ${response.status}`);
  }

  const data: ZoomTokenResponse = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export async function zoomGet<T>(
  endpoint: string,
  params?: Record<string, string>,
  retries = 3
): Promise<T> {
  const url = new URL(`https://api.zoom.us/v2${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await getZoomToken();
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (response.status === 429) {
      if (attempt === retries) throw new Error(`[Zoom] 429 Too Many Requests on ${endpoint}`);
      const retryAfterSec = Math.min(
        parseInt(response.headers.get('Retry-After') || '5', 10),
        60
      );
      console.warn(`[Zoom] 429 on ${endpoint} — waiting ${retryAfterSec}s (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, retryAfterSec * 1000));
      continue;
    }

    if (response.status === 401) {
      // Token may have expired mid-flight — clear cache and retry once
      cachedToken = null;
      if (attempt < retries) continue;
    }

    if (!response.ok) {
      throw new Error(`[Zoom] ${response.status} on ${endpoint}`);
    }

    return response.json();
  }

  throw new Error(`[Zoom] Exhausted retries for ${endpoint}`);
}
