// Google Wallet: a "Save to Google Wallet" link is a JWT signed with the service account key. It carries the loyalty class
// (the programme) and the loyalty object (this card) so nothing has to be created through the API first.
import { GOAL, THEME, hex, rewardText, tierOf } from './card.ts';
import type { Card } from './card.ts';
import { normalizePem, privateKeyDer } from './cms.ts';

export interface GoogleConfig { issuerId: string; serviceAccountEmail: string; keyPem: string }

export function googleConfig(env: (key: string) => string | undefined): GoogleConfig | null {
  const issuerId = env('GOOGLE_WALLET_ISSUER_ID');
  const serviceAccountEmail = env('GOOGLE_WALLET_SA_EMAIL');
  const key = env('GOOGLE_WALLET_SA_KEY');
  if (!issuerId || !serviceAccountEmail || !key) return null;
  return { issuerId, serviceAccountEmail, keyPem: normalizePem(key) };
}

export const MAX_LINK_LENGTH = 1800;   // Google rejects longer "save" links

export function walletPayload(card: Card, cfg: Pick<GoogleConfig, 'issuerId'>, siteUrl: string) {
  const classId = `${cfg.issuerId}.darta-club`;
  return {
    loyaltyClasses: [{
      id: classId,
      issuerName: 'Darta Barber Studio',
      programName: 'Darta Club',
      programLogo: { sourceUri: { uri: `${siteUrl}/img/wallet/logo@3x.png` } },
      reviewStatus: 'UNDER_REVIEW',
      countryCode: 'IT',
    }],
    loyaltyObjects: [{
      id: `${cfg.issuerId}.${card.id}`,
      classId,
      state: 'ACTIVE',
      accountId: card.id.slice(0, 8).toUpperCase(),
      accountName: card.name,
      hexBackgroundColor: hex(THEME[card.finish].bg),
      loyaltyPoints: { label: 'Timbri', balance: { string: `${card.stamps} / ${GOAL}` } },
      secondaryLoyaltyPoints: { label: 'Livello', balance: { string: tierOf(card.stamps) } },
      barcode: { type: 'QR_CODE', value: card.id, alternateText: card.id.slice(0, 8).toUpperCase() },
      textModulesData: [
        { id: 'barber', header: 'Barber', body: card.barber },
        { id: 'next', header: 'Prossimo premio', body: rewardText(card.stamps) },
      ],
    }],
  };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

export async function saveLink(card: Card, cfg: GoogleConfig, siteUrl: string, nowSeconds: number): Promise<string> {
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64urlText(JSON.stringify({
    iss: cfg.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: nowSeconds,
    origins: [siteUrl],
    payload: walletPayload(card, cfg, siteUrl),
  }));
  const key = await crypto.subtle.importKey('pkcs8', privateKeyDer(cfg.keyPem) as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${body}`)));
  const link = `https://pay.google.com/gp/v/save/${header}.${body}.${b64url(signature)}`;
  if (link.length > MAX_LINK_LENGTH) throw new Error(`save link is ${link.length} characters, Google accepts ${MAX_LINK_LENGTH}`);
  return link;
}
