// Apple Wallet web service (developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
// The pass names <webServiceURL> = .../darta-wallet/apple-ws; Apple calls, below it:
//   POST   /v1/devices/<device>/registrations/<passType>/<serial>   a device wants updates for a pass (body { pushToken })
//   DELETE /v1/devices/<device>/registrations/<passType>/<serial>   it no longer does
//   GET    /v1/devices/<device>/registrations/<passType>?passesUpdatedSince=<tag>   which of its passes changed
//   GET    /v1/passes/<passType>/<serial>                           the latest version of a pass
//   POST   /v1/log                                                  errors the device saw
// The salon's stamp (salon.ts) sends an empty push; the device then asks for the serials and downloads the new pass.
import type { AppleConfig } from './apple.ts';
import type { Card } from './card.ts';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DEVICE = '[A-Za-z0-9]{1,128}';
const PASS_TYPE = '[A-Za-z0-9.-]{1,128}';
const REGISTRATION = new RegExp(`/apple-ws/v1/devices/(${DEVICE})/registrations/(${PASS_TYPE})/(${UUID})/?$`);
const SERIALS = new RegExp(`/apple-ws/v1/devices/(${DEVICE})/registrations/(${PASS_TYPE})/?$`);
const PASS = new RegExp(`/apple-ws/v1/passes/(${PASS_TYPE})/(${UUID})/?$`);
const MAX_BODY = 1024;

export interface PassServiceDeps {
  getCard: (id: string) => Promise<Card | null>;
  /** true when the device was new for this pass */
  register: (device: string, cardId: string, pushToken: string) => Promise<boolean>;
  unregister: (device: string, cardId: string) => Promise<void>;
  /** the device's passes changed after `since` (ms since 1970, or none), with the newest change time */
  changedSerials: (device: string, sinceMs: number | null) => Promise<{ serials: string[]; lastUpdatedMs: number }>;
  /** the signed .pkpass of the card */
  pkpass: (card: Card) => Promise<Uint8Array>;
}

const empty = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Apple sends "Authorization: ApplePass <authenticationToken>". Constant-time compare of the two tokens. */
function authorised(req: Request, card: Card | null): boolean {
  const got = (req.headers.get('authorization') ?? '').replace(/^ApplePass\s+/, '');
  const want = card?.passToken ?? '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function handlePassService(req: Request, path: string, apple: AppleConfig, deps: PassServiceDeps): Promise<Response> {
  if (req.method === 'POST' && path.endsWith('/apple-ws/v1/log')) {
    const text = (await req.text()).slice(0, MAX_BODY);
    console.warn('apple wallet log', text);
    return empty(200);
  }

  let m = path.match(REGISTRATION);
  if (m && (req.method === 'POST' || req.method === 'DELETE')) {
    const [, device, passType, serial] = m;
    if (passType !== apple.passTypeId) return empty(404);
    const card = await deps.getCard(serial);
    if (!authorised(req, card)) return empty(401);
    if (req.method === 'DELETE') {
      await deps.unregister(device, serial);
      return empty(200);
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY) return empty(413);
    let pushToken: unknown;
    try { pushToken = JSON.parse(raw).pushToken; } catch { return empty(400); }
    if (typeof pushToken !== 'string' || !/^[0-9a-fA-F]{16,200}$/.test(pushToken)) return empty(400);
    return empty((await deps.register(device, serial, pushToken)) ? 201 : 200);
  }

  m = path.match(SERIALS);
  if (m && req.method === 'GET') {
    const [, device, passType] = m;
    if (passType !== apple.passTypeId) return empty(404);
    const tag = new URL(req.url).searchParams.get('passesUpdatedSince');
    const since = tag && /^\d{1,15}$/.test(tag) ? Number(tag) : null;
    const { serials, lastUpdatedMs } = await deps.changedSerials(device, since);
    if (!serials.length) return empty(204);
    return json({ serialNumbers: serials, lastUpdated: String(lastUpdatedMs) });
  }

  m = path.match(PASS);
  if (m && req.method === 'GET') {
    const [, passType, serial] = m;
    if (passType !== apple.passTypeId) return empty(404);
    const card = await deps.getCard(serial);
    if (!authorised(req, card)) return empty(401);
    const bytes = await deps.pkpass(card!);
    const headers: Record<string, string> = { 'Content-Type': 'application/vnd.apple.pkpass', 'Cache-Control': 'no-store' };
    if (card!.updatedAt) headers['Last-Modified'] = new Date(card!.updatedAt).toUTCString();
    return new Response(bytes as unknown as BodyInit, { status: 200, headers });
  }

  return empty(404);
}
