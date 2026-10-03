// POST /darta-checkout: cart in, Stripe Checkout URL out.
// GET  /darta-checkout: { live } so the shop knows whether to offer real payment or stay in demo mode.
import { allowedOrigins, reply } from './cors.ts';
import { parseCart, quote } from './pricing.ts';
import type { Catalog, Lang } from './pricing.ts';
import { couponParams, sessionParams } from './stripe.ts';
import { StripeError } from './stripe-api.ts';
import type { Param } from './stripe-api.ts';

const METHODS = 'GET, POST, OPTIONS';
const MAX_BODY = 8192;

// No 0/O, 1/I/L: customers read the number out loud on the phone. 31 symbols ^ 7 = 27 billion numbers.
export const ORDER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ORDER_NO_LENGTH = 7;

const PER_IP = { max: 10, windowS: 600 };   // checkouts per visitor per 10 minutes
const ALL_VISITORS = { max: 200, windowS: 3600 };   // checkouts per hour for the whole shop

export interface CheckoutDeps {
  env: (key: string) => string | undefined;
  loadCatalog: (lang: Lang) => Promise<Catalog>;
  stripe: (key: string, method: 'GET' | 'POST', path: string, params?: { [k: string]: Param }) => Promise<any>;
  /** true = allowed. Counts a hit in `bucket` and refuses once more than `max` happened inside the window. */
  rateLimit: (bucket: string, windowS: number, max: number) => Promise<boolean>;
  nowSeconds: () => number;
  random: (n: number) => Uint8Array;
}

export function newOrderNo(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < ORDER_NO_LENGTH; i++) out += ORDER_ALPHABET[bytes[i] % ORDER_ALPHABET.length];
  return `DA-${out}`;
}

/** Who is asking, without keeping their address: a short hash of the first forwarded IP. */
export async function visitorKey(req: Request): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const STATUS: Record<string, number> = {
  bad_cart: 400, unknown_product: 422, bad_variant: 422, bad_coupon: 422, digital_unsupported: 422, below_minimum: 422, bad_catalog: 500,
};

export async function handleCheckout(req: Request, deps: CheckoutDeps): Promise<Response> {
  const { env } = deps;
  const origins = allowedOrigins(env);
  const secretKey = env('STRIPE_SECRET_KEY');
  const siteUrl = (env('SITE_URL') ?? '').replace(/\/+$/, '');
  // "Live" needs the webhook secret too: without it customers could pay and the salon would never hear about it.
  const live = Boolean(secretKey && siteUrl && env('STRIPE_WEBHOOK_SECRET'));
  const send = (status: number, body?: unknown) => reply(req, origins, METHODS, status, body);

  if (req.method === 'OPTIONS') return send(204);
  if (req.method === 'GET') {
    // The probe says only whether real payments are on, so any page may read it. Before the keys are set this is
    // what lets the shop find out the server is there but payments are off.
    const res = send(200, { live });
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  }
  if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

  const origin = req.headers.get('origin');
  if (!origin || !origins.includes(origin)) return send(403, { error: 'forbidden_origin' });
  if (!live) return send(503, { error: 'not_configured' });
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return send(415, { error: 'bad_content_type' });
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return send(413, { error: 'too_large' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return send(413, { error: 'too_large' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return send(400, { error: 'bad_cart' }); }

  const parsed = parseCart(body);
  if (!parsed.ok) return send(400, { error: parsed.error });

  let catalog: Catalog;
  try { catalog = await deps.loadCatalog(parsed.value.lang); } catch (err) {
    console.error('catalog unavailable', String(err));
    return send(502, { error: 'catalog_unavailable' });
  }

  const priced = quote(catalog, parsed.value);
  if (!priced.ok) {
    if (priced.error === 'bad_catalog') console.error('catalog has a bad price, refusing to sell');
    return send(STATUS[priced.error] ?? 422, { error: priced.error });
  }
  const q = priced.value;

  // Only well-formed carts get this far, and only these cost Stripe API calls and leave objects in the Dashboard.
  const visitor = await visitorKey(req);
  const allowed = await deps.rateLimit(`checkout:${visitor}`, PER_IP.windowS, PER_IP.max)
    && await deps.rateLimit('checkout:all', ALL_VISITORS.windowS, ALL_VISITORS.max);
  if (!allowed) return send(429, { error: 'too_many_requests' });

  const orderNo = newOrderNo(deps.random(ORDER_NO_LENGTH));
  const now = deps.nowSeconds();
  let sessionId: string | undefined;
  try {
    let couponId: string | undefined;
    const coupon = couponParams(q, now);
    if (coupon) couponId = (await deps.stripe(secretKey!, 'POST', '/v1/coupons', coupon)).id;

    const create = (withImages: boolean) =>
      deps.stripe(secretKey!, 'POST', '/v1/checkout/sessions', sessionParams(q, { siteUrl, orderNo, now, couponId, withImages }));
    let session;
    try { session = await create(true); } catch (err) {
      if (!(err instanceof StripeError) || err.status !== 400) throw err;
      session = await create(false); // product photos are a nicety: retry once without them
    }
    sessionId = session.id;

    // The amount Stripe will charge must be the amount we priced. If not, the customer never reaches the payment page.
    if (session.amount_total !== q.total) {
      console.error('price mismatch', orderNo, session.amount_total, q.total);
      await deps.stripe(secretKey!, 'POST', `/v1/checkout/sessions/${session.id}/expire`, {}).catch(() => {});
      return send(500, { error: 'price_mismatch' });
    }
    if (typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) {
      throw new Error('Stripe returned no hosted checkout url');
    }
    return send(200, { url: session.url, orderNo });
  } catch (err) {
    console.error('checkout failed', orderNo, sessionId ?? '-', err instanceof StripeError ? err.message : String(err));
    return send(502, { error: 'payment_unavailable' });
  }
}
