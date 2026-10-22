// Salon-only stamps: POST /darta-wallet/salon (salon.ts) and Apple's web service (webservice.ts), with the database,
// Apple's push service and Google's API replaced by fakes. The fake database follows darta_add_stamp() in
// supabase/migrations/20261022000000_darta_stamps.sql; tests/stamp-sql.test.mjs runs the real SQL when PGlite is around.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleWallet } from '../supabase/functions/darta-wallet/handler.ts';
import { cardCode, MIN_GAP_S } from '../supabase/functions/darta-wallet/salon.ts';

const SITE = 'https://shop.example';
const SUPA = 'https://proj.supabase.co';
const FN = `${SUPA}/functions/v1/darta-wallet`;
const ID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10';
const PIN = '20261022';
const TOKEN = 'c0ffee'.repeat(10) + 'beef';
const DEVICE = 'a1b2c3d4e5f6';
const PUSH = 'ab'.repeat(32);
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' });
let appleEnv, googleEnv, dir;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'darta-salon-'));
  const o = (f) => join(dir, f);
  sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('ca.key'), '-out', o('ca.pem'), '-days', '2', '-subj', '/CN=Root']);
  sh('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('p.key'), '-out', o('p.csr'), '-subj', '/CN=Pass']);
  sh('openssl', ['x509', '-req', '-in', o('p.csr'), '-CA', o('ca.pem'), '-CAkey', o('ca.key'), '-CAcreateserial', '-out', o('p.pem'), '-days', '2']);
  appleEnv = { APPLE_PASS_TYPE_ID: 'pass.it.darta.club', APPLE_TEAM_ID: 'T1', APPLE_PASS_CERT_PEM: readFileSync(o('p.pem'), 'utf8'), APPLE_PASS_KEY_PEM: readFileSync(o('p.key'), 'utf8'), APPLE_WWDR_PEM: readFileSync(o('ca.pem'), 'utf8') };
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  googleEnv = { GOOGLE_WALLET_ISSUER_ID: '1234', GOOGLE_WALLET_SA_EMAIL: 'w@x.iam', GOOGLE_WALLET_SA_KEY: privateKey };
});

/** An in-memory salon: one card, its stamp log, the registered Apple devices, and what was sent to Apple and Google. */
function salon(over = {}) {
  let clock = 1_800_000_000;
  const cards = new Map([[ID, { id: ID, name: 'Lorenzo', finish: 'onyx', icon: 'scissors', barber: 'Thomas', stamps: over.stamps ?? 0, lang: 'it', passToken: TOKEN, updatedAt: new Date(clock * 1000).toISOString() }]]);
  const db = { cards, stamps: [], devices: [], pushes: [], google: [], hits: [] };
  const env = { SITE_URL: SITE, SUPABASE_URL: SUPA, DARTA_SALON_PIN: PIN, ...appleEnv, ...googleEnv, ...(over.env ?? {}) };
  const deps = {
    db,
    tick: (s) => { clock += s; },
    env: (k) => env[k],
    nowSeconds: () => clock,
    insertCard: async () => { throw new Error('not used'); },
    getCard: async (id) => (cards.has(id) ? { ...cards.get(id) } : null),
    loadAsset: async () => new Uint8Array([137, 80, 78, 71]),
    rateLimit: over.rateLimit ?? (async (bucket) => { db.hits.push(bucket); return true; }),
    addStamp: async (code, action, barber, minGapS) => {   // darta_add_stamp()
      const ids = [...cards.keys()].filter((id) => id.startsWith(code));
      if (!ids.length) return { result: 'not_found', cardId: null, stamps: null };
      if (ids.length > 1) return { result: 'ambiguous', cardId: null, stamps: null };
      const c = cards.get(ids[0]);
      const no = (result) => ({ result, cardId: c.id, stamps: c.stamps });
      if (action === 'stamp') {
        if (c.stamps >= 10) return no('card_full');
        const last = db.stamps.filter((s) => s.cardId === c.id && s.action === 'stamp').at(-1);
        if (last && last.at > clock - minGapS) return no('too_soon');
        c.stamps += 1;
      } else {
        if (c.stamps < 10) return no('not_full');
        c.stamps = 0;
      }
      c.updatedAt = new Date(clock * 1000).toISOString();
      db.stamps.push({ cardId: c.id, action, barber, after: c.stamps, at: clock });
      return { result: 'ok', cardId: c.id, stamps: c.stamps };
    },
    pushTokens: async (cardId) => db.devices.filter((d) => d.cardId === cardId).map((d) => d.push),
    dropPushToken: async (token) => { db.devices = db.devices.filter((d) => d.push !== token); },
    apnsPush: over.apnsPush ?? (async (token, apple) => { db.pushes.push({ token, topic: apple.passTypeId }); return 200; }),
    fetch: over.fetch ?? (async (url, init) => {
      db.google.push({ url, init });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      return new Response('{}', { status: over.googleStatus ?? 200 });
    }),
    register: async (device, cardId, push) => {
      const had = db.devices.some((d) => d.device === device && d.cardId === cardId);
      db.devices = [...db.devices.filter((d) => !(d.device === device && d.cardId === cardId)), { device, cardId, push }];
      return !had;
    },
    unregister: async (device, cardId) => { db.devices = db.devices.filter((d) => !(d.device === device && d.cardId === cardId)); },
    changedSerials: async (device, sinceMs) => {
      const mine = db.devices.filter((d) => d.device === device).map((d) => cards.get(d.cardId))
        .filter((c) => sinceMs === null || Date.parse(c.updatedAt) > sinceMs);
      return { serials: mine.map((c) => c.id), lastUpdatedMs: Math.max(0, ...mine.map((c) => Date.parse(c.updatedAt))) };
    },
  };
  return deps;
}

const stamp = (body, headers = {}) => new Request(`${FN}/salon`, {
  method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const apple = (method, path, { token = TOKEN, body } = {}) => new Request(`${FN}/apple-ws/v1${path}`, {
  method, headers: token ? { authorization: `ApplePass ${token}` } : {}, body,
});
const passJsonOf = async (res) => {
  const file = join(dir, `p-${Math.random()}.pkpass`);
  writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  return JSON.parse(sh('unzip', ['-p', file, 'pass.json']).toString());
};

test('a stamp from the salon adds one to the card, is logged, and both wallets are told', async () => {
  const s = salon();
  s.db.devices.push({ device: DEVICE, cardId: ID, push: PUSH });
  const res = await handleWallet(stamp({ pin: PIN, code: ID, barber: 'Mattia' }), s);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.result, body.stamps, body.goal, body.name, body.code], ['ok', 1, 10, 'Lorenzo', '3F2B8C1E']);
  assert.deepEqual(body.wallets, { apple: 1, google: true });
  assert.equal(s.db.cards.get(ID).stamps, 1);
  assert.deepEqual(s.db.stamps.map((x) => [x.action, x.barber, x.after]), [['stamp', 'Mattia', 1]]);
  assert.deepEqual(s.db.pushes, [{ token: PUSH, topic: 'pass.it.darta.club' }]);   // the push topic is the Pass Type ID
  // Google: an OAuth token for the wallet scope, then a PATCH of the saved card with the new count
  const [tok, patch] = s.db.google;
  assert.equal(tok.url, 'https://oauth2.googleapis.com/token');
  const assertion = new URLSearchParams(tok.init.body).get('assertion');
  assert.equal(JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url')).scope, 'https://www.googleapis.com/auth/wallet_object.issuer');
  assert.equal(patch.url, `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/1234.${ID}`);
  assert.equal(patch.init.method, 'PATCH');
  assert.equal(patch.init.headers.authorization, 'Bearer tok');
  const sent = JSON.parse(patch.init.body);
  assert.equal(sent.loyaltyPoints.balance.string, '1 / 10');
  assert.equal(sent.secondaryLoyaltyPoints.balance.string, 'Member');
  assert.ok(sent.textModulesData.some((m) => /Ancora 9 tagli/.test(m.body)));
});

test('after the stamp the Apple device finds the change and downloads a pass that shows it', async () => {
  const s = salon();
  // the device registers the pass it just added (Apple calls this by itself)
  const reg = await handleWallet(apple('POST', `/devices/${DEVICE}/registrations/pass.it.darta.club/${ID}`, { body: JSON.stringify({ pushToken: PUSH }) }), s);
  assert.equal(reg.status, 201);
  const again = await handleWallet(apple('POST', `/devices/${DEVICE}/registrations/pass.it.darta.club/${ID}`, { body: JSON.stringify({ pushToken: PUSH }) }), s);
  assert.equal(again.status, 200);                                    // already registered
  const first = await handleWallet(apple('GET', `/devices/${DEVICE}/registrations/pass.it.darta.club`, { token: null }), s);
  const { lastUpdated } = await first.json();
  assert.equal((await handleWallet(apple('GET', `/devices/${DEVICE}/registrations/pass.it.darta.club?passesUpdatedSince=${lastUpdated}`, { token: null }), s)).status, 204);

  s.tick(60);
  await handleWallet(stamp({ pin: PIN, code: ID.slice(0, 8).toUpperCase() }), s);   // typed: the 8 characters under the QR
  assert.equal(s.db.pushes.length, 1);

  const changed = await handleWallet(apple('GET', `/devices/${DEVICE}/registrations/pass.it.darta.club?passesUpdatedSince=${lastUpdated}`, { token: null }), s);
  assert.equal(changed.status, 200);
  const list = await changed.json();
  assert.deepEqual(list.serialNumbers, [ID]);
  assert.ok(Number(list.lastUpdated) > Number(lastUpdated));
  const latest = await handleWallet(apple('GET', `/passes/pass.it.darta.club/${ID}`), s);
  assert.equal(latest.status, 200);
  assert.equal(latest.headers.get('content-type'), 'application/vnd.apple.pkpass');
  assert.ok(latest.headers.get('last-modified'));
  const pass = await passJsonOf(latest);
  assert.equal(pass.storeCard.secondaryFields[0].value, '1 / 10');
  assert.equal(pass.webServiceURL, `${FN}/apple-ws`);
  assert.equal(pass.authenticationToken, TOKEN);
});

test('the first download already carries the web service, so the pass can update later', async () => {
  const pass = await passJsonOf(await handleWallet(new Request(`${FN}/apple/${ID}`), salon()));
  assert.equal(pass.webServiceURL, `${FN}/apple-ws`);
  assert.equal(pass.authenticationToken, TOKEN);
});

test('nobody without the salon PIN can stamp', async () => {
  const s = salon();
  for (const pin of [undefined, '', 'wrong-pin', PIN + ' ', PIN.slice(0, 7), 12345678, 'x'.repeat(100)]) {
    const res = await handleWallet(stamp({ pin, code: ID }), s);
    assert.equal(res.status, 401, String(pin));
    assert.deepEqual(await res.json(), { error: 'wrong_pin' });
  }
  assert.equal(s.db.cards.get(ID).stamps, 0);
  assert.equal(s.db.stamps.length, 0);
  // wrong guesses use up the rate limit like real stamps
  assert.ok(s.db.hits.filter((b) => /^salon:[0-9a-f]{16}$/.test(b)).length >= 7);
  assert.ok(s.db.hits.includes('salon:all'));
});

test('no other way changes the stamps: new cards start at 0, other origins and other methods are refused', async () => {
  const s = salon();
  assert.equal((await handleWallet(stamp({ pin: PIN, code: ID }, { origin: 'https://evil.example' }), s)).status, 403);
  assert.equal((await handleWallet(stamp({ pin: PIN, code: ID }, { origin: '' }), s)).status, 403);
  assert.equal((await handleWallet(new Request(`${FN}/salon`, { method: 'PUT', headers: { origin: SITE } }), s)).status, 405);
  assert.equal((await handleWallet(new Request(`${FN}/salon?pin=${PIN}&code=${ID}`), s)).status, 200);   // a GET is only the probe
  assert.equal(s.db.cards.get(ID).stamps, 0);
  // the Apple web service only reads passes and registers devices: with the pass token too, nothing stamps
  for (const [m, p] of [['POST', `/passes/pass.it.darta.club/${ID}`], ['PATCH', `/devices/${DEVICE}/registrations/pass.it.darta.club/${ID}`], ['PUT', `/passes/pass.it.darta.club/${ID}`]]) {
    assert.equal((await handleWallet(apple(m, p, { body: '{"stamps":10}' }), s)).status, 404, `${m} ${p}`);
  }
  assert.equal(s.db.cards.get(ID).stamps, 0);
});

test('without a PIN secret (or a short one) the salon is switched off', async () => {
  for (const pin of [undefined, '', '1234567']) {
    const res = await handleWallet(stamp({ pin, code: ID }), salon({ env: { DARTA_SALON_PIN: pin } }));
    assert.equal(res.status, 503);
  }
});

test('the salon is rate-limited before the PIN is even looked at', async () => {
  const s = salon({ rateLimit: async () => false });
  assert.equal((await handleWallet(stamp({ pin: PIN, code: ID }), s)).status, 429);
  assert.equal(s.db.cards.get(ID).stamps, 0);
});

test('one stamp per visit: a second scan within 3 hours is refused, the next visit counts', async () => {
  const s = salon();
  assert.equal((await handleWallet(stamp({ pin: PIN, code: ID }), s)).status, 200);
  const twice = await handleWallet(stamp({ pin: PIN, code: ID }), s);
  assert.equal(twice.status, 409);
  assert.deepEqual([(await twice.json()).error, s.db.cards.get(ID).stamps], ['too_soon', 1]);
  s.tick(MIN_GAP_S + 1);
  assert.equal((await (await handleWallet(stamp({ pin: PIN, code: ID }), s)).json()).stamps, 2);
});

test('a full card cannot take an 11th stamp; the free haircut resets it to 0', async () => {
  const s = salon({ stamps: 10 });
  const full = await handleWallet(stamp({ pin: PIN, code: ID }), s);
  assert.equal(full.status, 409);
  assert.equal((await full.json()).error, 'card_full');
  const redeem = await handleWallet(stamp({ pin: PIN, code: ID, action: 'redeem' }), s);
  assert.equal(redeem.status, 200);
  assert.deepEqual([(await redeem.json()).stamps, s.db.cards.get(ID).stamps], [0, 0]);
  assert.equal((await (await handleWallet(stamp({ pin: PIN, code: ID, action: 'redeem' }), s)).json()).error, 'not_full');
});

test('card numbers: the QR id or the 8 characters under it, nothing else', async () => {
  assert.equal(cardCode(ID), ID);
  assert.equal(cardCode(` ${ID.toUpperCase()} `), ID);
  assert.equal(cardCode('3F2B8C1E'), '3f2b8c1e');
  for (const bad of ['3f2b8c1', '%', "3f2b8c1e' or 1=1", '3f2b8c1e%', 'zzzzzzzz', null, 42]) assert.equal(cardCode(bad), null, String(bad));
  const s = salon();
  assert.equal((await handleWallet(stamp({ pin: PIN, code: '%' }), s)).status, 400);
  assert.equal((await handleWallet(stamp({ pin: PIN, code: '00000000' }), s)).status, 404);
});

test('a wallet that fails never undoes the stamp; a pass removed from a phone is forgotten', async () => {
  const s = salon({ apnsPush: async () => 410, fetch: async () => { throw new Error('google down'); } });
  s.db.devices.push({ device: DEVICE, cardId: ID, push: PUSH });
  const res = await handleWallet(stamp({ pin: PIN, code: ID }), s);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).wallets, { apple: 0, google: false });
  assert.equal(s.db.cards.get(ID).stamps, 1);
  assert.equal(s.db.devices.length, 0);
  // a card never saved in Google Wallet: Google answers 404, that is fine
  const g = salon({ googleStatus: 404 });
  assert.deepEqual((await (await handleWallet(stamp({ pin: PIN, code: ID }), g)).json()).wallets, { apple: 0, google: false });
});

test('Apple web service: wrong token, wrong pass type, bad push token, unregister, log', async () => {
  const s = salon();
  const reg = (opts) => apple('POST', `/devices/${DEVICE}/registrations/pass.it.darta.club/${ID}`, { body: JSON.stringify({ pushToken: PUSH }), ...opts });
  assert.equal((await handleWallet(reg({ token: 'x'.repeat(64) }), s)).status, 401);
  assert.equal((await handleWallet(reg({ token: null }), s)).status, 401);
  assert.equal((await handleWallet(apple('POST', `/devices/${DEVICE}/registrations/pass.other/${ID}`, { body: '{}' }), s)).status, 404);
  assert.equal((await handleWallet(reg({ body: JSON.stringify({ pushToken: '<script>' }) }), s)).status, 400);
  assert.equal((await handleWallet(apple('GET', `/passes/pass.it.darta.club/${ID}`, { token: 'nope' }), s)).status, 401);
  assert.equal((await handleWallet(apple('GET', '/passes/pass.it.darta.club/00000000-0000-4000-8000-000000000000'), s)).status, 401);
  assert.equal(s.db.devices.length, 0);
  assert.equal((await handleWallet(reg(), s)).status, 201);
  assert.equal((await handleWallet(apple('DELETE', `/devices/${DEVICE}/registrations/pass.it.darta.club/${ID}`), s)).status, 200);
  assert.equal(s.db.devices.length, 0);
  assert.equal((await handleWallet(apple('POST', '/log', { token: null, body: JSON.stringify({ logs: ['x'] }) }), s)).status, 200);
  // Apple Wallet off: the whole web service is absent
  assert.equal((await handleWallet(reg(), salon({ env: { APPLE_PASS_TYPE_ID: '' } }))).status, 404);
});

test('salone.html loads its own files, stamped with the hash of what they contain', () => {
  const html = readFileSync(new URL('../salone.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="\/((?:js|css)\/[^"?]+)\?v=([0-9a-f]{8})"/g)) {
    const body = readFileSync(new URL(`../${m[1]}`, import.meta.url), 'utf8');
    assert.equal(m[2], createHash('md5').update(body).digest('hex').slice(0, 8), `${m[1]} changed: update its ?v= in salone.html`);
  }
  assert.match(html, /noindex/);
});
