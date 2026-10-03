// Verifies the Stripe-Signature header: HMAC-SHA256 over "<timestamp>.<raw body>" with the endpoint secret.
const TOLERANCE_S = 300;
const HEX = /^[0-9a-f]{64}$/;

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Compares two strings without stopping at the first different character. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!header || !secret) return false;

  let timestamp = NaN;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === 'v1' && HEX.test(value)) candidates.push(value);
  }
  if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_S) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return candidates.some((c) => sameString(c, expected));
}
