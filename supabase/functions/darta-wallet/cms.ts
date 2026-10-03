// The signature a .pkpass needs: a detached CMS (PKCS #7) SignedData over manifest.json, made with the Pass Type ID
// certificate and carrying Apple's WWDR certificate. Built by hand on WebCrypto so there is nothing to install.

const NULL = new Uint8Array([0x05, 0x00]);
const enc = new TextEncoder();

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

function lengthBytes(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

/** One DER element: tag, length, then the parts. */
export const tlv = (tag: number, ...parts: Uint8Array[]): Uint8Array => {
  const body = concat(...parts);
  return concat(new Uint8Array([tag]), lengthBytes(body.length), body);
};

export function oid(dotted: string): Uint8Array {
  const n = dotted.split('.').map(Number);
  const bytes: number[] = [n[0] * 40 + n[1]];
  for (const v of n.slice(2)) {
    const chunk = [v & 0x7f];
    for (let r = Math.floor(v / 128); r > 0; r = Math.floor(r / 128)) chunk.unshift((r & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, new Uint8Array(bytes));
}

export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Pasted secrets often carry literal "\n" instead of newlines. */
export const normalizePem = (pem: string) => pem.replace(/\\n/g, '\n').trim();

interface Tlv { tag: number; start: number; body: number; end: number }
function readTlv(buf: Uint8Array, at: number): Tlv {
  const tag = buf[at];
  let len = buf[at + 1];
  let body = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[at + 2 + i];
    body = at + 2 + n;
  }
  if (body + len > buf.length) throw new Error('certificate is not valid DER');
  return { tag, start: at, body, end: body + len };
}

/** The two pieces of a certificate that name the signer: the issuer and the serial number, as complete DER elements. */
export function certIdentity(certDer: Uint8Array): { issuer: Uint8Array; serial: Uint8Array } {
  const cert = readTlv(certDer, 0);
  const tbs = readTlv(certDer, cert.body);
  let at = tbs.body;
  let el = readTlv(certDer, at);
  if (el.tag === 0xa0) { at = el.end; el = readTlv(certDer, at); }   // optional explicit version
  const serial = certDer.slice(el.start, el.end);
  el = readTlv(certDer, el.end);                                       // signature algorithm
  el = readTlv(certDer, el.end);                                       // issuer
  return { issuer: certDer.slice(el.start, el.end), serial };
}

/** Accepts a PKCS#8 key ("BEGIN PRIVATE KEY") or an old PKCS#1 key ("BEGIN RSA PRIVATE KEY"). */
export function privateKeyDer(pem: string): Uint8Array {
  const der = pemToDer(pem);
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der;
  return tlv(0x30, new Uint8Array([0x02, 0x01, 0x00]), tlv(0x30, oid('1.2.840.113549.1.1.1'), NULL), tlv(0x04, der));
}

export async function importSigningKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', privateKeyDer(pem) as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

const compare = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

const utcTime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';

/** Detached CMS signature (DER) of `content`. `certs` are the signer certificate first, then the intermediates (WWDR). */
export async function signDetached(content: Uint8Array, signerKey: CryptoKey, certs: Uint8Array[], now: Date): Promise<Uint8Array> {
  const sha256Alg = tlv(0x30, oid(OID_SHA256), NULL);
  const rsaAlg = tlv(0x30, oid(OID_RSA), NULL);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content as BufferSource));

  const attrs = [
    tlv(0x30, oid('1.2.840.113549.1.9.3'), tlv(0x31, oid(OID_DATA))),                          // content type
    tlv(0x30, oid('1.2.840.113549.1.9.5'), tlv(0x31, tlv(0x17, enc.encode(utcTime(now))))),    // signing time
    tlv(0x30, oid('1.2.840.113549.1.9.4'), tlv(0x31, tlv(0x04, digest))),                      // message digest
  ].sort(compare);                                                                             // DER: a SET is sorted
  const attrBytes = concat(...attrs);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signerKey, tlv(0x31, attrBytes) as BufferSource));

  const { issuer, serial } = certIdentity(certs[0]);
  const signerInfo = tlv(
    0x30,
    new Uint8Array([0x02, 0x01, 0x01]),
    tlv(0x30, issuer, serial),
    sha256Alg,
    tlv(0xa0, attrBytes),
    rsaAlg,
    tlv(0x04, signature),
  );
  const signedData = tlv(
    0x30,
    new Uint8Array([0x02, 0x01, 0x01]),
    tlv(0x31, sha256Alg),
    tlv(0x30, oid(OID_DATA)),                 // detached: no content inside
    tlv(0xa0, ...certs),
    tlv(0x31, signerInfo),
  );
  return tlv(0x30, oid(OID_SIGNED_DATA), tlv(0xa0, signedData));
}
