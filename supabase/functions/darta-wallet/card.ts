// The loyalty card as the wallet passes see it: validated input, the look of each finish, and the texts.
export const FINISHES = ['onyx', 'gobetti', 'chrome', 'holo'] as const;
export const ICONS = ['scissors', 'bolt', 'crown', 'fire'] as const;
export const BARBERS = ['Thomas', 'Mattia', 'Rrapi'] as const;
export const GOAL = 10;   // the tenth haircut is free

export type Finish = typeof FINISHES[number];
export type Icon = typeof ICONS[number];
export type Barber = typeof BARBERS[number];
export type Lang = 'it' | 'en';
export interface CardInput { name: string; finish: Finish; icon: Icon; barber: Barber; stamps: number; lang: Lang }
export interface Card extends CardInput { id: string }
export type Parsed = { ok: true; value: CardInput; error?: undefined } | { ok: false; error: string; value?: undefined };

/** Colours of each finish on the pass: [r, g, b] background, text and small labels. */
export const THEME: Record<Finish, { bg: number[]; fg: number[]; label: number[] }> = {
  onyx: { bg: [11, 11, 10], fg: [239, 233, 223], label: [168, 162, 152] },
  gobetti: { bg: [18, 52, 50], fg: [239, 233, 223], label: [160, 196, 190] },
  chrome: { bg: [118, 123, 120], fg: [255, 255, 255], label: [226, 228, 226] },   // mid grey: the white logo stays readable
  holo: { bg: [22, 23, 35], fg: [239, 233, 223], label: [176, 170, 200] },
};

/** A card from the database or an old caller may have no language: Italian then. */
export const langOf = (card: { lang?: string }): Lang => (card.lang === 'en' ? 'en' : 'it');

export const rgb = (c: number[]) => `rgb(${c.join(',')})`;
export const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

export const tierOf = (n: number) => (n >= GOAL ? 'Gold' : n >= 5 ? 'Regular' : 'Member');
export function rewardText(n: number, lang: Lang = 'it'): string {
  const left = GOAL - n;
  if (lang === 'en') return left <= 0 ? 'Free haircut unlocked' : `${left} more ${left === 1 ? 'haircut' : 'haircuts'} until your free one`;
  return left <= 0 ? 'Taglio omaggio sbloccato' : `Ancora ${left} ${left === 1 ? 'taglio' : 'tagli'} al taglio omaggio`;
}

/** The words printed on the pass, in each language. */
export const WORDS = {
  it: { tier: 'LIVELLO', stamps: 'TIMBRI', barber: 'BARBER', holder: 'TITOLARE', next: 'PROSSIMO PREMIO', description: 'Tessera Darta Club',
    where: 'Dove', hours: 'Orari', hoursValue: 'Da martedì a sabato, 10:00 - 19:00', site: 'Sito', how: 'Come funziona',
    howValue: 'Un timbro a ogni taglio. Il decimo taglio è omaggio.', note: 'Nota', noteValue: 'Tessera dimostrativa: i timbri non sono ancora collegati al salone.', points: 'Timbri', level: 'Livello', nextHead: 'Prossimo premio' },
  en: { tier: 'TIER', stamps: 'STAMPS', barber: 'BARBER', holder: 'CARDHOLDER', next: 'NEXT REWARD', description: 'Darta Club card',
    where: 'Where', hours: 'Hours', hoursValue: 'Tuesday to Saturday, 10am - 7pm', site: 'Website', how: 'How it works',
    howValue: 'One stamp per haircut. The tenth haircut is free.', note: 'Note', noteValue: 'Demo card: the stamps are not connected to the studio yet.', points: 'Stamps', level: 'Tier', nextHead: 'Next reward' },
} as const;

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && list.includes(v);

/** Name on the card: one short line, no control characters or angle brackets. */
export function cleanName(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16).trim() : '';
  return t || 'Ospite';
}

export function parseCardInput(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_card' };
  const { name, finish, icon, barber, stamps } = body as Record<string, unknown>;
  if (!oneOf(FINISHES, finish) || !oneOf(ICONS, icon) || !oneOf(BARBERS, barber)) return { ok: false, error: 'bad_card' };
  if (typeof stamps !== 'number' || !Number.isInteger(stamps) || stamps < 0 || stamps > GOAL) return { ok: false, error: 'bad_card' };
  const lang: Lang = body && (body as Record<string, unknown>).lang === 'en' ? 'en' : 'it';
  return { ok: true, value: { name: cleanName(name), finish, icon, barber, stamps, lang } };
}
