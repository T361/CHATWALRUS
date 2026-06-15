// Edge-compatible session verification — uses Web Crypto API (no Node.js crypto).
// This file is safe to import in Next.js middleware (Edge runtime).

export const ADMIN_SESSION_COOKIE = 'chatwalrus_admin_session';

export interface AdminSession {
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyHmacSha256(
  message: string,
  signatureB64url: string,
  secret: string
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64urlToBytes(signatureB64url);
    return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(message));
  } catch {
    return false;
  }
}

export async function getAdminSessionEdge(
  cookieValue: string | undefined
): Promise<AdminSession | null> {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || !cookieValue) return null;

  const dotIdx = cookieValue.indexOf('.');
  if (dotIdx === -1) return null;

  const encodedPayload = cookieValue.slice(0, dotIdx);
  const signature = cookieValue.slice(dotIdx + 1);

  // Reject if there are multiple dots (malformed token)
  if (signature.includes('.')) return null;

  const valid = await verifyHmacSha256(encodedPayload, signature, secret);
  if (!valid) return null;

  try {
    const payloadStr = new TextDecoder().decode(base64urlToBytes(encodedPayload));
    const payload = JSON.parse(payloadStr) as { role?: string; iat?: number; exp?: number };
    const now = Math.floor(Date.now() / 1000);

    if (payload.role !== 'admin' || !payload.exp || payload.exp <= now) return null;

    return {
      role: 'admin',
      issuedAt: payload.iat ?? 0,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
