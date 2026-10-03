import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleWallet } from '../supabase/functions/darta-wallet/handler.ts';
import { passAssets } from '../supabase/functions/darta-wallet/apple.ts';

const SITE = 'https://shop.example';
const SUPA = 'https://proj.supabase.co';
const ID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10';
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' });
let appleEnv, googleEnv;

before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'darta-wallet-h-'));
  const o = (f) => join(dir, f);
  sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('ca.key'), '-out', o('ca.pem'), '-days', '2', '-subj', '/CN=Root']);
  sh('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('p.key'), '-out', o('p.csr'), '-subj', '/CN=Pass']);
  sh('openssl', ['x509', '-req', '-in', o('p.csr'), '-CA', o('ca.pem'), '-CAkey', o('ca.key'), '-CAcreateserial', '-out', o('p.pem'), '-days', '2']);
  appleEnv = { APPLE_PASS_TYPE_ID: 'pass.t', APPLE_TEAM_ID: 'T1', APPLE_PASS_CERT_PEM: readFileSync(o('p.pem'), 'utf8'), APPLE_PASS_KEY_PEM: readFileSync(o('p.key'), 'utf8'), APPLE_WWDR_PEM: readFileSync(o('ca.pem'), 'utf8') };
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  googleEnv = { GOOGLE_WALLET_ISSUER_ID: '1234', GOOGLE_WALLET_SA_EMAIL: 'w@x.iam', GOOGLE_WALLET_SA_KEY: privateKey };
});

const CARD = { name: 'Lorenzo', finish: 'onyx', icon: 'scissors', barber: 'Thomas', stamps: 4 };
function deps(over = {}) {
  const log = { inserted: [], hits: [], assets: [] };
  const env = { SITE_URL: SITE, SUPABASE_URL: SUPA, ...(over.env ?? {}) };
  return {
    log,
    env: (k) => env[k],
    nowSeconds: () => 1_800_000_000,
    insertCard: over.insertCard ?? (async (c) => { log.inserted.push(c); return ID; }),
    getCard: over.getCard ?? (async (id) => (id === ID ? { id, ...CARD } : null)),
    loadAsset: async (path) => { log.assets.push(path); return new Uint8Array([137, 80, 78, 71]); },
    rateLimit: over.rateLimit ?? (async (bucket, windowS, max) => { log.hits.push({ bucket, windowS, max }); return true; }),
  };
}
const post = (body, headers = {}) => new Request('https://fn.example/functions/v1/darta-wallet', {
  method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const get = (path = '', headers = {}) => new Request(`https://fn.example/functions/v1/darta-wallet${path}`, { headers });

test('probe: which wallets are on, readable from any page', async () => {
  const both = await handleWallet(get(), deps({ env: { ...appleEnv, ...googleEnv } }));
  assert.deepEqual(await both.json(), { apple: true, google: true });
  assert.equal(both.headers.get('access-control-allow-origin'), '*');
  const none = await handleWallet(get('', { origin: 'https://anywhere.example' }), deps());
  assert.deepEqual(await none.json(), { apple: false, google: false });
  assert.equal(none.headers.get('access-control-allow-origin'), '*');
  const onlyGoogle = await handleWallet(get(), deps({ env: googleEnv }));
  assert.deepEqual(await onlyGoogle.json(), { apple: false, google: true });
  const noSite = await handleWallet(get(), deps({ env: { ...googleEnv, SITE_URL: '' } }));
  assert.deepEqual(await noSite.json(), { apple: false, google: false });
});

test('POST stores the card and answers with the links for the wallets that are on', async () => {
  const d = deps({ env: { ...appleEnv, ...googleEnv } });
  const res = await handleWallet(post(CARD), d);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, ID);
  assert.equal(body.apple, `${SUPA}/functions/v1/darta-wallet/apple/${ID}`);
  assert.match(body.google, /^https:\/\/pay\.google\.com\/gp\/v\/save\/ey/);
  assert.deepEqual(d.log.inserted, [{ ...CARD, lang: 'it' }]);
  assert.match(d.log.hits[0].bucket, /^wallet:[0-9a-f]{16}$/);
  assert.deepEqual([d.log.hits[1].bucket, d.log.hits[1].max], ['wallet:all', 300]);
});

test('only the wallets that are configured come back', async () => {
  const res = await handleWallet(post(CARD), deps({ env: googleEnv }));
  const body = await res.json();
  assert.equal(body.apple, null);
  assert.ok(body.google);
});

test('POST is refused: other origins, no wallet configured, bad content, bad cards, too big', async () => {
  const on = { env: googleEnv };
  assert.equal((await handleWallet(post(CARD, { origin: 'https://evil.example' }), deps(on))).status, 403);
  assert.equal((await handleWallet(post(CARD), deps())).status, 503);
  assert.equal((await handleWallet(post(CARD, { 'content-type': 'text/plain' }), deps(on))).status, 415);
  assert.equal((await handleWallet(post({ ...CARD, stamps: 99 }), deps(on))).status, 400);
  assert.equal((await handleWallet(post('{nope'), deps(on))).status, 400);
  assert.equal((await handleWallet(post('x'.repeat(2000)), deps(on))).status, 413);
  const d = deps(on);
  await handleWallet(post({ ...CARD, finish: 'gold' }), d);
  assert.equal(d.log.inserted.length, 0);
});

test('a visitor who asks too often gets 429 and nothing is stored', async () => {
  const d = deps({ env: googleEnv, rateLimit: async () => false });
  const res = await handleWallet(post(CARD), d);
  assert.equal(res.status, 429);
  assert.equal(d.log.inserted.length, 0);
});

test('the Apple pass downloads as .pkpass', async () => {
  const d = deps({ env: appleEnv });
  const res = await handleWallet(get(`/apple/${ID}`), d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.apple.pkpass');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);   // a zip
  assert.deepEqual(d.log.assets.sort(), passAssets(CARD.stamps).map(([, p]) => p).sort());
});

test('pass download: unknown card, malformed id, wallet off, outage', async () => {
  assert.equal((await handleWallet(get('/apple/00000000-0000-4000-8000-000000000000'), deps({ env: appleEnv }))).status, 404);
  const odd = await handleWallet(get('/apple/../../etc/passwd'), deps({ env: appleEnv }));
  assert.equal((await odd.json()).apple, true);                         // not an id: it is just the probe
  assert.equal((await handleWallet(get(`/apple/${ID}`), deps())).status, 503);
  const broken = deps({ env: appleEnv });
  broken.loadAsset = async () => { throw new Error('site down'); };
  const res = await handleWallet(get(`/apple/${ID}`), broken);
  assert.equal(res.status, 502);
  assert.ok(!JSON.stringify(await res.json()).includes('site down'));
});

test('a database outage is a clean 502', async () => {
  const res = await handleWallet(post(CARD), deps({ env: googleEnv, insertCard: async () => { throw new Error('db down'); } }));
  assert.equal(res.status, 502);
});
