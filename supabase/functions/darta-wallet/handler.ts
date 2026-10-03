// /darta-wallet
//   GET                  -> { apple, google }: which wallets are switched on (so the shop knows whether to offer them)
//   POST                 -> remembers the card the visitor designed and answers with the wallet links
//   GET /apple/<card id> -> the Apple Wallet pass (.pkpass) for that card
import { allowedOrigins, reply } from './cors.ts';
import { appleConfig, buildPkpass, passAssets } from './apple.ts';
import { parseCardInput } from './card.ts';
import type { Card, CardInput } from './card.ts';
import { googleConfig, saveLink } from './google.ts';

const METHODS = 'GET, POST, OPTIONS';
const MAX_BODY = 1024;
const CARD_ID = /\/apple\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/;
const MAKE = { max: 6, windowS: 600 };        // cards per visitor per 10 minutes
const MAKE_ALL = { max: 300, windowS: 3600 };   // cards per hour for the whole shop
const DOWNLOAD = { max: 30, windowS: 600 };    // pass downloads per visitor per 10 minutes

export interface WalletDeps {
  env: (key: string) => string | undefined;
  nowSeconds: () => number;
  insertCard: (card: CardInput) => Promise<string>;
  getCard: (id: string) => Promise<Card | null>;
  /** a picture from the site, by path such as /img/wallet/icon.png */
  loadAsset: (path: string) => Promise<Uint8Array>;
  rateLimit: (bucket: string, windowS: number, max: number) => Promise<boolean>;
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

  if (req.method === 'GET') {
    const m = new URL(req.url).pathname.match(CARD_ID);
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
      const assets = new Map<string, Uint8Array>();
      for (const [name, path] of passAssets(card.stamps)) assets.set(name, await deps.loadAsset(path));
      const pass = await buildPkpass(card, apple, siteUrl, assets, new Date(deps.nowSeconds() * 1000));
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

  const allowed = await deps.rateLimit(`wallet:${await visitorKey(req)}`, MAKE.windowS, MAKE.max)
    && await deps.rateLimit('wallet:all', MAKE_ALL.windowS, MAKE_ALL.max);
  if (!allowed) return send(429, { error: 'too_many_requests' });

  try {
    const id = await deps.insertCard(parsed.value);
    const card: Card = { id, ...parsed.value };
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
