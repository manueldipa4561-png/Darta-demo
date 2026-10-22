// POST /darta-wallet/salon: the salon page (salone.html) adds a stamp to a card, or resets a full card when the free haircut
// is taken. The only way a card's stamps ever change. Protected by the salon PIN (secret DARTA_SALON_PIN, at least 8 characters)
// and by rate limits, so the PIN cannot be guessed. After the change both wallets are told: Apple by an empty push to every
// device that registered the pass (it then downloads the new one), Google by patching the saved card.
import type { AppleConfig } from './apple.ts';
import { BARBERS, GOAL } from './card.ts';
import type { Card } from './card.ts';
import { updateObject } from './google.ts';
import type { GoogleConfig } from './google.ts';

export const MIN_PIN = 8;
export const MIN_GAP_S = 3 * 3600;                  // one stamp per card per visit: a second scan within 3 hours is refused
const TRIES = { max: 40, windowS: 600 };            // salon requests per device per 10 minutes (a busy day is ~30 cuts)
const TRIES_ALL = { max: 200, windowS: 3600 };      // for the whole salon page per hour: caps PIN guessing from many IPs
const MAX_BODY = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHORT = /^[0-9a-f]{8}$/;

export type StampAction = 'stamp' | 'redeem';
export type StampResult = 'ok' | 'not_found' | 'ambiguous' | 'too_soon' | 'card_full' | 'not_full';

export interface SalonDeps {
  nowSeconds: () => number;
  rateLimit: (bucket: string, windowS: number, max: number) => Promise<boolean>;
  /** darta_add_stamp(): atomic change + log */
  addStamp: (code: string, action: StampAction, barber: string | null, minGapS: number) => Promise<{ result: StampResult; cardId: string | null; stamps: number | null }>;
  getCard: (id: string) => Promise<Card | null>;
  pushTokens: (cardId: string) => Promise<string[]>;
  /** forget a device whose push token Apple says is gone */
  dropPushToken: (token: string) => Promise<void>;
  /** HTTP status of Apple's answer to an empty push */
  apnsPush: (token: string, apple: AppleConfig) => Promise<number>;
  fetch: typeof fetch;
}

/** The card number as typed or scanned: the full id (the QR) or its first 8 characters (printed under the QR). */
export function cardCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return UUID.test(t) || SHORT.test(t) ? t : null;
}

async function samePin(given: unknown, pin: string): Promise<boolean> {
  if (typeof given !== 'string' || given.length > 64) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(pin)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

interface SalonContext {
  pin: string | undefined;
  visitor: string;
  siteUrl: string;
  apple: AppleConfig | null;
  google: GoogleConfig | null;
  send: (status: number, body?: unknown) => Response;
}

export async function handleSalon(req: Request, ctx: SalonContext, deps: SalonDeps): Promise<Response> {
  const { send } = ctx;
  if (!ctx.pin || ctx.pin.length < MIN_PIN) return send(503, { error: 'not_configured' });
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return send(415, { error: 'bad_content_type' });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return send(413, { error: 'too_large' });

  // Counted before the PIN is checked, so wrong guesses use up the same budget as real stamps.
  const allowed = await deps.rateLimit(`salon:${ctx.visitor}`, TRIES.windowS, TRIES.max)
    && await deps.rateLimit('salon:all', TRIES_ALL.windowS, TRIES_ALL.max);
  if (!allowed) return send(429, { error: 'too_many_requests' });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return send(400, { error: 'bad_request' }); }
  if (!body || typeof body !== 'object') return send(400, { error: 'bad_request' });
  if (!(await samePin(body.pin, ctx.pin))) return send(401, { error: 'wrong_pin' });

  const code = cardCode(body.code);
  if (!code) return send(400, { error: 'bad_code' });
  const action: StampAction = body.action === 'redeem' ? 'redeem' : 'stamp';
  const barber = (BARBERS as readonly string[]).includes(body.barber as string) ? body.barber as string : null;

  const done = await deps.addStamp(code, action, barber, MIN_GAP_S);
  if (done.result === 'not_found' || done.result === 'ambiguous') return send(404, { error: done.result });
  const card = done.cardId ? await deps.getCard(done.cardId) : null;
  if (!card) return send(404, { error: 'not_found' });
  const who = { name: card.name, code: card.id.slice(0, 8).toUpperCase(), stamps: card.stamps, goal: GOAL };
  if (done.result !== 'ok') return send(409, { error: done.result, ...who });

  return send(200, { result: 'ok', action, ...who, wallets: await notifyWallets(card, ctx, deps) });
}

/** Tells the wallets; a failure here never undoes the stamp (the pass catches up on the next change or refresh). */
async function notifyWallets(card: Card, ctx: SalonContext, deps: SalonDeps): Promise<{ apple: number; google: boolean }> {
  let apple = 0;
  let google = false;
  if (ctx.apple) {
    const cfg = ctx.apple;
    for (const token of await deps.pushTokens(card.id).catch(() => [])) {
      try {
        const status = await deps.apnsPush(token, cfg);
        if (status === 200) apple++;
        else if (status === 410) await deps.dropPushToken(token);   // the pass was removed from that device
        else console.error('apns push', status);
      } catch (err) { console.error('apns push failed', String(err)); }
    }
  }
  if (ctx.google) {
    try { google = await updateObject(card, ctx.google, ctx.siteUrl, deps.nowSeconds(), deps.fetch); }
    catch (err) { console.error('google wallet update failed', card.id, String(err)); }
  }
  return { apple, google };
}
