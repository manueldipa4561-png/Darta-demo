// Supabase Edge Function entry point (verify_jwt off: the shop calls it from the browser, Origin and rate limits protect it).
// Secrets, all optional: a wallet only switches on when its whole group is set. SITE_URL is required.
//   Apple Wallet:  APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_PEM
//   Google Wallet: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_KEY
//   Salon stamps:  DARTA_SALON_PIN (8+ characters; without it nobody can stamp)
// Members only: STRIPE_READ_KEY (or STRIPE_SECRET_KEY) checks that the card request comes from a paid subscription.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWallet } from './handler.ts';
import type { AppleConfig } from './apple.ts';
import type { Card } from './card.ts';
import { stripeFetch } from './stripe-api.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const assets = new Map<string, Uint8Array>();   // the pictures never change while the function is warm
const CARD_COLUMNS = 'id, name, finish, icon, barber, stamps, lang, pass_token, updated_at';
const toCard = (row: Record<string, unknown> | null): Card | null =>
  row ? ({ ...row, passToken: row.pass_token, updatedAt: row.updated_at }) as unknown as Card : null;

// Wallet pushes are signed with the Pass Type ID certificate itself (TLS client certificate), over HTTP/2.
let apns: Deno.HttpClient | null = null;
async function apnsPush(token: string, apple: AppleConfig): Promise<number> {
  apns ??= Deno.createHttpClient({ cert: apple.certPem, key: apple.keyPem });
  const res = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST', client: apns, headers: { 'apns-topic': apple.passTypeId }, body: '{}',
    signal: AbortSignal.timeout(8000),
  } as RequestInit);
  await res.body?.cancel();
  return res.status;
}

Deno.serve((req) =>
  handleWallet(req, {
    env: (k) => Deno.env.get(k),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    stripe: (key, method, path) => stripeFetch(key, method, path),
    insertCard: async (card) => {
      const { data, error } = await db.from('darta_cards').insert(card).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    getCard: async (id) => {
      const { data, error } = await db.from('darta_cards').select(CARD_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return toCard(data);
    },
    addStamp: async (code, action, barber, minGapS) => {
      const { data, error } = await db.rpc('darta_add_stamp', { p_code: code, p_action: action, p_barber: barber, p_min_gap_seconds: minGapS }).single();
      if (error) throw new Error(error.message);
      const row = data as { result: string; card_id: string | null; stamps: number | null };
      return { result: row.result as never, cardId: row.card_id, stamps: row.stamps };
    },
    pushTokens: async (cardId) => {
      const { data, error } = await db.from('darta_pass_devices').select('push_token').eq('card_id', cardId);
      if (error) throw new Error(error.message);
      return [...new Set((data ?? []).map((r) => r.push_token as string))];
    },
    dropPushToken: async (token) => {
      const { error } = await db.from('darta_pass_devices').delete().eq('push_token', token);
      if (error) throw new Error(error.message);
    },
    apnsPush,
    fetch: (input, init) => fetch(input, init),
    register: async (device, cardId, pushToken) => {
      const { data: had } = await db.from('darta_pass_devices').select('card_id').eq('device_id', device).eq('card_id', cardId).maybeSingle();
      const { error } = await db.from('darta_pass_devices').upsert({ device_id: device, card_id: cardId, push_token: pushToken });
      if (error) throw new Error(error.message);
      return !had;
    },
    unregister: async (device, cardId) => {
      const { error } = await db.from('darta_pass_devices').delete().eq('device_id', device).eq('card_id', cardId);
      if (error) throw new Error(error.message);
    },
    changedSerials: async (device, sinceMs) => {
      let q = db.from('darta_pass_devices').select('card_id, darta_cards!inner(updated_at)').eq('device_id', device);
      if (sinceMs !== null) q = q.gt('darta_cards.updated_at', new Date(sinceMs).toISOString());
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as { card_id: string; darta_cards: { updated_at: string } }[];
      return {
        serials: rows.map((r) => r.card_id),
        lastUpdatedMs: Math.max(0, ...rows.map((r) => Date.parse(r.darta_cards.updated_at))),
      };
    },
    loadAsset: async (path) => {
      const hit = assets.get(path);
      if (hit) return hit;
      const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
      const res = await fetch(`${site}${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`${path} answered ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assets.set(path, bytes);
      return bytes;
    },
    rateLimit: async (bucket, windowS, max) => {
      const { data, error } = await db.rpc('darta_rate_limit', { p_bucket: bucket, p_window_seconds: windowS, p_max: max });
      if (error) {
        console.error('rate limiter unavailable', error.message);
        return true;
      }
      return data === true;
    },
  })
);
