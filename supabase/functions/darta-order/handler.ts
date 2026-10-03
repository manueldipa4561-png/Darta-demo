// GET /darta-order?s=cs_...: what the thank-you page needs after Stripe sends the customer back.
// Returns no personal data: the session id in the URL is the customer's only proof, so it unlocks only the order summary.
import { allowedOrigins, reply } from './cors.ts';
import { fetchSessionWithItems, StripeError } from './stripe-api.ts';

const METHODS = 'GET, OPTIONS';
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9_]{8,200}$/;
const PER_IP = { max: 60, windowS: 60 };   // lookups per visitor per minute

export interface OrderLookupDeps {
  env: (key: string) => string | undefined;
  stripe: (key: string, method: 'GET', path: string) => Promise<any>;
  rateLimit: (bucket: string, windowS: number, max: number) => Promise<boolean>;
}

/** Who is asking, without keeping their address: a short hash of the first forwarded IP. */
async function visitorKey(req: Request): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleOrderLookup(req: Request, deps: OrderLookupDeps): Promise<Response> {
  const origins = allowedOrigins(deps.env);
  const send = (status: number, body?: unknown) => reply(req, origins, METHODS, status, body);
  if (req.method === 'OPTIONS') return send(204);
  if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });

  const origin = req.headers.get('origin');
  if (!origin || !origins.includes(origin)) return send(403, { error: 'forbidden_origin' });
  // A read-only restricted key is enough here; it falls back to the main key.
  const key = deps.env('STRIPE_READ_KEY') ?? deps.env('STRIPE_SECRET_KEY');
  if (!key) return send(503, { error: 'not_configured' });

  const id = new URL(req.url).searchParams.get('s') ?? '';
  if (!SESSION_ID.test(id)) return send(400, { error: 'bad_session' });
  if (!(await deps.rateLimit(`order:${await visitorKey(req)}`, PER_IP.windowS, PER_IP.max))) {
    return send(429, { error: 'too_many_requests' });
  }

  try {
    const s = await fetchSessionWithItems(deps.stripe, key, id);
    return send(200, {
      paid: s.payment_status === 'paid' || s.payment_status === 'no_payment_required',
      pending: s.status === 'complete' && s.payment_status === 'unpaid',
      orderNo: String(s.client_reference_id ?? ''),
      mode: s.metadata?.mode === 'ship' ? 'ship' : 'pickup',
      total: Number(s.amount_total) || 0,
      items: (s.line_items?.data ?? []).map((l: any) => ({ name: String(l.description ?? '').slice(0, 120), q: Number(l.quantity) || 1 })),
    });
  } catch (err) {
    if (err instanceof StripeError && err.status === 404) return send(404, { error: 'not_found' });
    console.error('order lookup failed', String(err));
    return send(502, { error: 'unavailable' });
  }
}
