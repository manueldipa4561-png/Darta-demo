// Apple Wallet and Google Wallet passes. OpenSSL and unzip (the real tools) check what the code produces.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCardInput, cleanName, tierOf, rewardText } from '../supabase/functions/darta-wallet/card.ts';
import { zipStore, crc32 } from '../supabase/functions/darta-wallet/zip.ts';
import { appleConfig, buildPkpass, passAssets, passJson } from '../supabase/functions/darta-wallet/apple.ts';
import { googleConfig, saveLink, walletPayload, MAX_LINK_LENGTH } from '../supabase/functions/darta-wallet/google.ts';

const SITE = 'https://shop.example';
const CARD = { id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', name: 'Lorenzo', finish: 'onyx', icon: 'scissors', barber: 'Thomas', stamps: 3, lang: 'it' };
const sh = (cmd, args, opts) => execFileSync(cmd, args, { stdio: 'pipe', ...opts });
let dir, pems;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'darta-wallet-'));
  const o = (f) => join(dir, f);
  sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('ca.key'), '-out', o('ca.pem'), '-days', '2', '-subj', '/CN=Test Root/O=Test']);
  sh('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('wwdr.key'), '-out', o('wwdr.csr'), '-subj', '/CN=Test WWDR/O=Test']);
  writeFileSync(o('ca.ext'), 'basicConstraints=CA:TRUE\n');
  sh('openssl', ['x509', '-req', '-in', o('wwdr.csr'), '-CA', o('ca.pem'), '-CAkey', o('ca.key'), '-CAcreateserial', '-out', o('wwdr.pem'), '-days', '2', '-extfile', o('ca.ext')]);
  sh('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', o('pass.key'), '-out', o('pass.csr'), '-subj', '/UID=pass.test.darta/OU=TEAM123456/CN=Pass Type ID/O=Test']);
  sh('openssl', ['x509', '-req', '-in', o('pass.csr'), '-CA', o('wwdr.pem'), '-CAkey', o('wwdr.key'), '-CAcreateserial', '-out', o('pass.pem'), '-days', '2']);
  pems = { cert: readFileSync(o('pass.pem'), 'utf8'), key: readFileSync(o('pass.key'), 'utf8'), wwdr: readFileSync(o('wwdr.pem'), 'utf8') };
});

const APPLE_ENV = () => ({
  APPLE_PASS_TYPE_ID: 'pass.test.darta', APPLE_TEAM_ID: 'TEAM123456',
  APPLE_PASS_CERT_PEM: pems.cert, APPLE_PASS_KEY_PEM: pems.key, APPLE_WWDR_PEM: pems.wwdr,
});
const png = (n) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n, n, n]);
const assetsFor = (stamps) => new Map(passAssets(stamps).map(([name], i) => [name, png(i)]));

test('card input: only known looks and 0..10 stamps are accepted, the name is cleaned', () => {
  assert.deepEqual(parseCardInput({ name: '  Lore\n<b>nzo  ', finish: 'gobetti', icon: 'fire', barber: 'Rrapi', stamps: 10 }).value,
    { name: 'Lore b nzo', finish: 'gobetti', icon: 'fire', barber: 'Rrapi', stamps: 10, lang: 'it' });
  for (const bad of [null, 'x', {}, { ...CARD, finish: 'gold' }, { ...CARD, icon: 'x' }, { ...CARD, barber: 'Evil' },
    { ...CARD, stamps: 11 }, { ...CARD, stamps: -1 }, { ...CARD, stamps: 2.5 }, { ...CARD, stamps: '3' }]) {
    assert.equal(parseCardInput(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(cleanName(''), 'Ospite');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName(5), 'Ospite');
  assert.deepEqual([tierOf(0), tierOf(5), tierOf(10)], ['Member', 'Regular', 'Gold']);
  assert.match(rewardText(9), /Ancora 1 taglio al/);
  assert.match(rewardText(10), /sbloccato/);
});

test('zip: unzip accepts it and every file comes back byte for byte', () => {
  const files = [{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'dir/b.bin', data: Uint8Array.from({ length: 5000 }, (_, i) => i % 251) }, { name: 'empty', data: new Uint8Array() }];
  const zip = join(dir, 'x.zip');
  writeFileSync(zip, zipStore(files));
  assert.match(sh('unzip', ['-t', zip]).toString(), /No errors detected/);
  for (const f of files) assert.deepEqual(new Uint8Array(sh('unzip', ['-p', zip, f.name], { maxBuffer: 1e7 })), f.data);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('apple config needs every piece, and accepts pasted "\\n" for newlines', () => {
  assert.equal(appleConfig(() => undefined), null);
  const env = APPLE_ENV();
  delete env.APPLE_WWDR_PEM;
  assert.equal(appleConfig((k) => env[k]), null);
  const pasted = Object.fromEntries(Object.entries(APPLE_ENV()).map(([k, v]) => [k, v.replace(/\n/g, '\\n')]));
  assert.ok(appleConfig((k) => pasted[k]).certPem.includes('\n'));
});

test('pass.json: a store card with the QR, the stamps and the right ids', () => {
  const p = passJson(CARD, { passTypeId: 'pass.test.darta', teamId: 'TEAM123456' }, SITE);
  assert.equal(p.formatVersion, 1);
  assert.equal(p.serialNumber, CARD.id);
  assert.equal(p.passTypeIdentifier, 'pass.test.darta');
  assert.equal(p.teamIdentifier, 'TEAM123456');
  assert.equal(p.storeCard.secondaryFields[0].value, '3 / 10');
  assert.equal(p.barcodes[0].format, 'PKBarcodeFormatQR');
  assert.equal(p.barcodes[0].message, CARD.id);
  assert.match(p.backgroundColor, /^rgb\(\d+,\d+,\d+\)$/);
  assert.ok(p.storeCard.backFields.some((f) => /dimostrativa/.test(f.value)));
});

test('pkpass: valid zip, manifest hashes match, and OpenSSL verifies the signature and the chain', async () => {
  const cfg = appleConfig((k) => APPLE_ENV()[k]);
  const bytes = await buildPkpass(CARD, cfg, SITE, assetsFor(3), new Date());
  const pkpass = join(dir, 'card.pkpass');
  writeFileSync(pkpass, bytes);
  assert.match(sh('unzip', ['-t', pkpass]).toString(), /No errors detected/);
  const out = join(dir, 'unpacked');
  sh('unzip', ['-o', pkpass, '-d', out]);
  assert.deepEqual(readdirSync(out).sort(), ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png', 'manifest.json', 'pass.json', 'signature', 'strip@2x.png']);

  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(Object.keys(manifest).length, 8);
  for (const [name, sha1] of Object.entries(manifest)) assert.equal(createHash('sha1').update(readFileSync(join(out, name))).digest('hex'), sha1, name);
  assert.ok(!('signature' in manifest) && !('manifest.json' in manifest));

  // signature: detached, DER, made by the pass certificate, chained to the (test) root through the (test) WWDR certificate
  sh('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', join(out, 'signature'), '-content', join(out, 'manifest.json'), '-CAfile', join(dir, 'ca.pem'), '-out', '/dev/null']);
  // a changed manifest must not verify
  writeFileSync(join(out, 'manifest-tampered.json'), readFileSync(join(out, 'manifest.json'), 'utf8').replace('a', 'b'));
  assert.throws(() => sh('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', join(out, 'signature'), '-content', join(out, 'manifest-tampered.json'), '-CAfile', join(dir, 'ca.pem'), '-out', '/dev/null']));
  // both certificates travel inside the signature
  const certs = sh('openssl', ['pkcs7', '-inform', 'DER', '-in', join(out, 'signature'), '-print_certs']).toString();
  assert.equal((certs.match(/BEGIN CERTIFICATE/g) ?? []).length, 2);
  assert.match(certs, /Pass Type ID/);
  assert.match(certs, /Test WWDR/);
});

test('pkpass: a missing picture is an error, not a broken pass', async () => {
  const cfg = appleConfig((k) => APPLE_ENV()[k]);
  const assets = assetsFor(3);
  assets.delete('logo.png');
  await assert.rejects(buildPkpass(CARD, cfg, SITE, assets, new Date()), /missing picture logo\.png/);
});

test('pkpass: the stamp strip follows the stamp count', () => {
  assert.equal(passAssets(0).at(-1)[1], '/img/wallet/strip-0@2x.png');
  assert.equal(passAssets(10).at(-1)[1], '/img/wallet/strip-10@2x.png');
});

test('an old-style PKCS#1 private key works too', async () => {
  const oldKey = createPrivateKey(pems.key).export({ type: 'pkcs1', format: 'pem' });
  assert.match(oldKey, /BEGIN RSA PRIVATE KEY/);
  const cfg = appleConfig((k) => ({ ...APPLE_ENV(), APPLE_PASS_KEY_PEM: oldKey })[k]);
  const bytes = await buildPkpass(CARD, cfg, SITE, assetsFor(3), new Date());
  const pkpass = join(dir, 'old-key.pkpass');
  writeFileSync(pkpass, bytes);
  const out = join(dir, 'old-key');
  sh('unzip', ['-o', pkpass, '-d', out]);
  sh('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', join(out, 'signature'), '-content', join(out, 'manifest.json'), '-CAfile', join(dir, 'ca.pem'), '-out', '/dev/null']);
});

function serviceAccount() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  return { privateKey, publicKey, env: { GOOGLE_WALLET_ISSUER_ID: '3388000000012345678', GOOGLE_WALLET_SA_EMAIL: 'wallet@darta.iam.gserviceaccount.com', GOOGLE_WALLET_SA_KEY: privateKey } };
}

test('google link: a JWT signed by the service account, with the class and the card, under the 1800-character limit', async () => {
  const sa = serviceAccount();
  const cfg = googleConfig((k) => sa.env[k]);
  const longest = { ...CARD, name: 'WWWWWWWWWWWWWWWW', barber: 'Mattia', finish: 'holo', stamps: 10 };
  const link = await saveLink(longest, cfg, SITE, 1_800_000_000);
  assert.ok(link.startsWith('https://pay.google.com/gp/v/save/'));
  assert.ok(link.length <= MAX_LINK_LENGTH, `link is ${link.length} characters`);
  const [h, p, s] = link.slice('https://pay.google.com/gp/v/save/'.length).split('.');
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(sa.publicKey), Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.iss, 'wallet@darta.iam.gserviceaccount.com');
  assert.equal(claims.aud, 'google');
  assert.equal(claims.typ, 'savetowallet');
  assert.deepEqual(claims.origins, [SITE]);
  const obj = claims.payload.loyaltyObjects[0];
  assert.equal(obj.id, `3388000000012345678.${longest.id}`);
  assert.equal(obj.classId, claims.payload.loyaltyClasses[0].id);
  assert.equal(obj.barcode.value, longest.id);
  assert.equal(obj.loyaltyPoints.balance.string, '10 / 10');
});

test('google: typed text can only land in text fields, and config needs all three secrets', () => {
  const payload = walletPayload({ ...CARD, name: '"}{<script>' }, { issuerId: '1' }, SITE);
  assert.equal(payload.loyaltyObjects[0].accountName, '"}{<script>');   // JSON-encoded later, never concatenated
  assert.equal(googleConfig(() => undefined), null);
  assert.equal(googleConfig((k) => ({ GOOGLE_WALLET_ISSUER_ID: '1', GOOGLE_WALLET_SA_EMAIL: 'a@b' })[k]), null);
});

test('English cards: the language is taken from the request and everything on the pass is English', () => {
  assert.equal(parseCardInput({ ...CARD, lang: 'en' }).value.lang, 'en');
  assert.equal(parseCardInput({ ...CARD, lang: 'fr' }).value.lang, 'it');       // anything else is Italian
  assert.equal(parseCardInput({ name: 'x', finish: 'onyx', icon: 'fire', barber: 'Thomas', stamps: 1 }).value.lang, 'it');
  assert.match(rewardText(9, 'en'), /^1 more haircut until/);
  assert.match(rewardText(7, 'en'), /^3 more haircuts until/);
  assert.match(rewardText(10, 'en'), /unlocked/);
  const p = passJson({ ...CARD, lang: 'en' }, { passTypeId: 'pass.t', teamId: 'T' }, SITE);
  assert.equal(p.description, 'Darta Club card');
  assert.deepEqual(p.storeCard.secondaryFields.map((f) => f.label), ['STAMPS', 'BARBER']);
  assert.deepEqual(p.storeCard.auxiliaryFields.map((f) => f.label), ['CARDHOLDER', 'NEXT REWARD']);
  assert.equal(p.storeCard.backFields.find((f) => f.key === 'site').value, `${SITE}/en/`);
  const everything = JSON.stringify(p);
  for (const italian of ['Tessera', 'TIMBRI', 'LIVELLO', 'TITOLARE', 'Dove', 'Orari', 'Nota', 'taglio omaggio']) assert.ok(!everything.includes(italian), italian);
  const g = walletPayload({ ...CARD, lang: 'en' }, { issuerId: '1' }, SITE).loyaltyObjects[0];
  assert.equal(g.loyaltyPoints.label, 'Stamps');
  assert.equal(g.textModulesData[1].header, 'Next reward');
});

test('a card without a language is Italian', () => {
  const { lang, ...old } = CARD;
  assert.equal(passJson(old, { passTypeId: 'pass.t', teamId: 'T' }, SITE).storeCard.secondaryFields[0].label, 'TIMBRI');
});
