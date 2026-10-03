// Minimal Stripe REST client (no SDK): form-encoded bodies with bracket notation.
// This file is copied into every function folder that talks to Stripe; tests/shared-copies.test.mjs keeps the copies identical.

export type Param = string | number | boolean | null | undefined | Param[] | { [key: string]: Param };

/** {a:{b:[1]}} -> a[b][0]=1, the way Stripe expects nested parameters. */
export function encodeForm(obj: { [key: string]: Param }): string {
  const out: string[] = [];
  const walk = (key: string, value: Param) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${key}[${i}]`, v));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(obj)) walk(k, v);
  return out.join('&');
}

export class StripeError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Stripe ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

/** One call to the Stripe API. The secret key never leaves this function. */
export async function stripeFetch(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  params?: { [key: string]: Param },
  idempotencyKey?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': '2024-06-20', // pinned: from 2025-03-31 the shipping address moves to collected_information
  };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: method === 'POST' && params ? encodeForm(params) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, String(json?.error?.message ?? res.statusText).slice(0, 300));
  return json;
}

/** A Checkout Session with ALL its line items (expand[] stops at 10, a cart can hold 20). */
export async function fetchSessionWithItems(
  api: (key: string, method: 'GET', path: string) => Promise<any>,
  key: string,
  sessionId: string,
): Promise<any> {
  const session = await api(key, 'GET', `/v1/checkout/sessions/${sessionId}`);
  const items = await api(key, 'GET', `/v1/checkout/sessions/${sessionId}/line_items?limit=100`);
  return { ...session, line_items: { data: Array.isArray(items?.data) ? items.data : [] } };
}
