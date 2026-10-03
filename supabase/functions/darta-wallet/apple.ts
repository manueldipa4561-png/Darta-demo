// Apple Wallet: a .pkpass is a ZIP of pass.json, its pictures, manifest.json (SHA-1 of every file) and a signature of the manifest.
import { GOAL, THEME, rewardText, rgb, tierOf } from './card.ts';
import type { Card } from './card.ts';
import { importSigningKey, normalizePem, pemToDer, signDetached } from './cms.ts';
import { zipStore } from './zip.ts';
import type { ZipFile } from './zip.ts';

export interface AppleConfig {
  passTypeId: string;      // pass.com.example.darta  (Apple Developer > Identifiers > Pass Type IDs)
  teamId: string;          // 10 characters          (Apple Developer > Membership)
  certPem: string;         // the Pass Type ID certificate
  keyPem: string;          // its private key
  wwdrPem: string;         // Apple's WWDR intermediate certificate
}

export function appleConfig(env: (key: string) => string | undefined): AppleConfig | null {
  const passTypeId = env('APPLE_PASS_TYPE_ID');
  const teamId = env('APPLE_TEAM_ID');
  const certPem = env('APPLE_PASS_CERT_PEM');
  const keyPem = env('APPLE_PASS_KEY_PEM');
  const wwdrPem = env('APPLE_WWDR_PEM');
  if (!passTypeId || !teamId || !certPem || !keyPem || !wwdrPem) return null;
  return { passTypeId, teamId, certPem: normalizePem(certPem), keyPem: normalizePem(keyPem), wwdrPem: normalizePem(wwdrPem) };
}

/** Pictures the pass needs, as [name inside the pass, path on the site]. */
export const passAssets = (stamps: number): [string, string][] => [
  ['icon.png', '/img/wallet/icon.png'],
  ['icon@2x.png', '/img/wallet/icon@2x.png'],
  ['icon@3x.png', '/img/wallet/icon@3x.png'],
  ['logo.png', '/img/wallet/logo.png'],
  ['logo@2x.png', '/img/wallet/logo@2x.png'],
  ['logo@3x.png', '/img/wallet/logo@3x.png'],
  ['strip@2x.png', `/img/wallet/strip-${stamps}@2x.png`],
];

export function passJson(card: Card, cfg: Pick<AppleConfig, 'passTypeId' | 'teamId'>, siteUrl: string) {
  const theme = THEME[card.finish];
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: card.id,
    organizationName: 'Darta Barber Studio',
    description: 'Tessera Darta Club',
    backgroundColor: rgb(theme.bg),
    foregroundColor: rgb(theme.fg),
    labelColor: rgb(theme.label),
    storeCard: {
      headerFields: [{ key: 'tier', label: 'LIVELLO', value: tierOf(card.stamps) }],
      secondaryFields: [
        { key: 'stamps', label: 'TIMBRI', value: `${card.stamps} / ${GOAL}` },
        { key: 'barber', label: 'BARBER', value: card.barber },
      ],
      auxiliaryFields: [
        { key: 'name', label: 'TITOLARE', value: card.name },
        { key: 'next', label: 'PROSSIMO PREMIO', value: rewardText(card.stamps) },
      ],
      backFields: [
        { key: 'where', label: 'Dove', value: 'Via Gobetti 184, 65100 Pescara' },
        { key: 'hours', label: 'Orari', value: 'Da martedì a sabato, 10:00 - 19:00' },
        { key: 'site', label: 'Sito', value: siteUrl },
        { key: 'terms', label: 'Come funziona', value: 'Un timbro a ogni taglio. Il decimo taglio è omaggio.' },
        { key: 'demo', label: 'Nota', value: 'Tessera dimostrativa: i timbri non sono ancora collegati al salone.' },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: card.id, messageEncoding: 'iso-8859-1', altText: card.id.slice(0, 8).toUpperCase() }],
  };
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** `assets` maps the names from passAssets() to the picture bytes. */
export async function buildPkpass(card: Card, cfg: AppleConfig, siteUrl: string, assets: Map<string, Uint8Array>, now: Date): Promise<Uint8Array> {
  const files: ZipFile[] = [{ name: 'pass.json', data: new TextEncoder().encode(JSON.stringify(passJson(card, cfg, siteUrl))) }];
  for (const [name] of passAssets(card.stamps)) {
    const data = assets.get(name);
    if (!data) throw new Error(`missing picture ${name}`);
    files.push({ name, data });
  }
  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = toHex(await crypto.subtle.digest('SHA-1', f.data as BufferSource));   // Apple asks for SHA-1 here
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

  const key = await importSigningKey(cfg.keyPem);
  const signature = await signDetached(manifestBytes, key, [pemToDer(cfg.certPem), pemToDer(cfg.wwdrPem)], now);
  return zipStore([...files, { name: 'manifest.json', data: manifestBytes }, { name: 'signature', data: signature }]);
}
