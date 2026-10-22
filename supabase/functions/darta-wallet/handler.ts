// /darta-wallet
//   GET                  -> { apple, google }: which wallets are switched on (so the shop knows whether to offer them)
//   POST                 -> a member's Darta Card: needs the id of a paid subscription checkout, stores the card (always
//                           0 stamps: only the salon stamps) and answers with the wallet links
//   GET /apple/<card id> -> the Apple Wallet pass (.pkpass) for that card
//   POST /salon          -> the salon adds a stamp (salon.ts, PIN protected)
//   /apple-ws/v1/...     -> Apple Wallet's web service, so passes refresh after a stamp (webservice.ts)
import { allowedOrigins, reply } from './cors.ts';
import { appleConfig, buildPkpass, passAssets, webServiceUrl } from './apple.ts';
import type { AppleConfig } from './apple.ts';
import { cleanName, parseCardInput } from './card.ts';
import type { Card, CardInput } from './card.ts';
import { googleConfig, saveLink } from './google.ts';
import { StripeError } from './stripe-api.ts';
import { handleSalon } from './salon.ts';
import type { SalonDeps } from './salon.ts';
import { handlePassService } from './webservice.ts';
import type { PassServiceDeps } from './webservice.ts';

const METHODS = 'GET, POST, OPTIONS';
const MAX_BODY = 1024;
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9_]{8,200}$/;
const CARD_ID = /\/apple\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/;
const MAKE = { max: 6, windowS: 600 };        // cards per visitor per 10 minutes
const MAKE_ALL = { max: 300, windowS: 3600 };   // cards per hour for the whole shop
const DOWNLOAD = { max: 30, windowS: 600 };    // pass downloads per visitor per 10 minutes
const SERVICE = { max: 120, windowS: 600 };    // Apple web service calls per device IP per 10 minutes

export interface WalletDeps extends SalonDeps, Omit<PassServiceDeps, 'pkpass'> {
  env: (key: string) => string | undefined;
  nowSeconds: () => number;
  insertCard: (card: CardInput) => Promise<string>;
  getCard: (id: string) => Promise<Card | null>;
  /** a picture from the site, by path such as /img/wallet/icon.png */
  loadAsset: (path: string) => Promise<Uint8Array>;
  rateLimit: (bucket: string, windowS: number, max: number) => Promise<boolean>;
  stripe: (key: string, method: 'GET', path: string) => Promise<any>;
}

async function signedPass(card: Card, apple: AppleConfig, siteUrl: string, supabaseUrl: string, deps: WalletDeps): Promise<Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  for (const [name, path] of passAssets(card.stamps)) assets.set(name, await deps.loadAsset(path));
  return buildPkpass(card, apple, siteUrl, assets, new Date(deps.nowSeconds() * 1000), supabaseUrl ? webServiceUrl(supabaseUrl) : undefined);
}

async function visitorKey(req: Request): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleWallet(req: Request, deps: WalletDeps): Promise<Response> {
  const { env } = deps;
  const origins = allowedOrigins(env);
  const siteUrl = (env('SITE_URL') ?? '').replace(/\/+$/, '');
  const supabaseUrl = (env('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const apple = siteUrl ? appleConfig(env) : null;
  const google = siteUrl ? googleConfig(env) : null;
  const send = (status: number, body?: unknown) => reply(req, origins, METHODS, status, body);

  if (req.method === 'OPTIONS') return send(204);
  const path = new URL(req.url).pathname;

  if (path.includes('/apple-ws/v1/')) {
    if (!apple || !supabaseUrl) return new Response(null, { status: 404 });
    if (!(await deps.rateLimit(`wallet-ws:${await visitorKey(req)}`, SERVICE.windowS, SERVICE.max))) return new Response(null, { status: 429 });
    try {
      return await handlePassService(req, path, apple, { ...deps, pkpass: (card) => signedPass(card, apple, siteUrl, supabaseUrl, deps) });
    } catch (err) {
      console.error('apple web service failed', String(err));
      return new Response(null, { status: 500 });
    }
  }

  if (/\/salon\/?$/.test(path) && req.method === 'POST') {
    const origin = req.headers.get('origin');
    if (!origin || !origins.includes(origin)) return send(403, { error: 'forbidden_origin' });
    try {
      return await handleSalon(req, { pin: env('DARTA_SALON_PIN'), visitor: await visitorKey(req), siteUrl, apple, google, send }, deps);
    } catch (err) {
      console.error('salon stamp failed', String(err));
      return send(502, { error: 'stamp_unavailable' });
    }
  }

  if (req.method === 'GET') {
    const m = path.match(CARD_ID);
    if (!m) {
      // The probe says only which wallets are on, so any page may read it.
      const res = send(200, { apple: Boolean(apple && supabaseUrl), google: Boolean(google) });
      res.headers.set('Access-Control-Allow-Origin', '*');
      return res;
    }
    if (!apple) return send(503, { error: 'not_configured' });
    if (!(await deps.rateLimit(`wallet-dl:${await visitorKey(req)}`, DOWNLOAD.windowS, DOWNLOAD.max))) return send(429, { error: 'too_many_requests' });
    const card = await deps.getCard(m[1]);
    if (!card) return send(404, { error: 'not_found' });
    try {
      const pass = await signedPass(card, apple, siteUrl, supabaseUrl, deps);
      return new Response(pass as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Cache-Control': 'no-store' } });
    } catch (err) {
      console.error('apple pass failed', card.id, String(err));
      return send(502, { error: 'pass_unavailable' });
    }
  }

  if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
  const origin = req.headers.get('origin');
  if (!origin || !origins.includes(origin)) return send(403, { error: 'forbidden_origin' });
  if (!apple && !google) return send(503, { error: 'not_configured' });
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return send(415, { error: 'bad_content_type' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return send(413, { error: 'too_large' });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return send(413, { error: 'too_large' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return send(400, { error: 'bad_card' }); }
  const parsed = parseCardInput(body);
  if (!parsed.ok) return send(400, { error: parsed.error });
  const session = (body as Record<string, unknown>).session;
  if (typeof session !== 'string' || !SESSION_ID.test(session)) return send(403, { error: 'not_member' });
  const stripeKey = env('STRIPE_READ_KEY') ?? env('STRIPE_SECRET_KEY');
  if (!stripeKey) return send(503, { error: 'not_configured' });

  const allowed = await deps.rateLimit(`wallet:${await visitorKey(req)}`, MAKE.windowS, MAKE.max)
    && await deps.rateLimit('wallet:all', MAKE_ALL.windowS, MAKE_ALL.max);
  if (!allowed) return send(429, { error: 'too_many_requests' });

  // The Darta Card comes with a subscription: Stripe must confirm this checkout was a paid membership.
  let input = parsed.value;
  try {
    const s = await deps.stripe(stripeKey, 'GET', `/v1/checkout/sessions/${session}`);
    const paid = s?.payment_status === 'paid' || s?.payment_status === 'no_payment_required';
    if (s?.mode !== 'subscription' || !paid) return send(403, { error: 'not_member' });
    input = { ...input, stamps: 0, name: parsed.value.name === 'Ospite' ? cleanName(s.customer_details?.name) : parsed.value.name };
  } catch (err) {
    if (err instanceof StripeError && err.status === 404) return send(403, { error: 'not_member' });
    console.error('wallet membership check failed', String(err));
    return send(502, { error: 'wallet_unavailable' });
  }

  try {
    const id = await deps.insertCard(input);
    const card: Card = { id, ...input };
    return send(200, {
      id,
      apple: apple && supabaseUrl ? `${supabaseUrl}/functions/v1/darta-wallet/apple/${id}` : null,
      google: google ? await saveLink(card, google, siteUrl, deps.nowSeconds()) : null,
    });
  } catch (err) {
    console.error('wallet card failed', String(err));
    return send(502, { error: 'wallet_unavailable' });
  }
}
