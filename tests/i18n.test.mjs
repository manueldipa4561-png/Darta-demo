// The English site: the runtime in js/core.js, the dictionary, the generated English pages and the links between languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const dict = JSON.parse(read('data/en.json'));

// ---- the runtime, running the real js/core.js against a minimal browser
function runtime(lang, dictionary = {}) {
  const listeners = [];
  globalThis.window = { DARTA_EN: dictionary, addEventListener() {} };
  globalThis.document = {
    documentElement: { lang, classList: { toggle() {} } },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}),
  };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} };
  globalThis.location = { hash: '', search: '', pathname: '/', replace() {} };
  globalThis.history = { pushState() {}, replaceState() {}, state: null };
  globalThis.addEventListener = (...a) => listeners.push(a);
  globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
  new Function(read('js/core.js'))();
  return globalThis.window.DARTA;
}

test('the Italian site is untouched: t() returns its own text, euros are written the Italian way', () => {
  const D = runtime('it', { 'Prenota': 'Book' });
  assert.equal(D.lang, 'it');
  assert.equal(D.t('Prenota'), 'Prenota');
  assert.equal(D.eur(1600), '16€');
  assert.equal(D.eur(490), '4,90€');
  assert.equal(D.url.product({ slug: 'wax-powder' }), '/prodotti/wax-powder');
  assert.deepEqual([D.path.shop, D.path.services, D.path.order, D.hash.cart], ['/shop', '/servizi', '/ordine', '#carrello']);
});

test('the English site: phrases come from the dictionary, placeholders are filled, unknown phrases stay as they are', () => {
  const D = runtime('en', { 'Prenota': 'Book', 'Ancora {n} tagli': '{n} more haircuts', 'constructor': 'x' });
  assert.equal(D.lang, 'en');
  assert.equal(D.t('Prenota'), 'Book');
  assert.equal(D.t('Ancora {n} tagli', { n: 3 }), '3 more haircuts');
  assert.equal(D.t('Frase sconosciuta'), 'Frase sconosciuta');
  assert.equal(D.t('Ciao {name}', { name: 'Mario' }), 'Ciao Mario');
  assert.equal(D.t('Ciao {name}', {}), 'Ciao {name}');
  assert.equal(D.t('toString'), 'toString');                     // prototype keys are not phrases
  assert.equal(D.t('hasOwnProperty'), 'hasOwnProperty');
});

test('English money and links', () => {
  const D = runtime('en');
  assert.equal(D.eur(1600), '€16');
  assert.equal(D.eur(490), '€4.90');
  assert.equal(D.eur(123456), '€1,234.56');
  assert.equal(D.url.product({ slug: 'wax-powder' }), '/en/products/wax-powder');
  assert.equal(D.url.service({ slug: 'skin-fade' }), '/en/services/skin-fade');
  assert.deepEqual([D.path.home, D.path.shop, D.path.services, D.path.order, D.hash.cart], ['/en/', '/en/shop', '/en/services', '/en/order', '#cart']);
});

test('the router understands #cart as well as #carrello', () => {
  const D = runtime('en');
  for (const [hash, name] of [['#cart', 'carrello'], ['#carrello', 'carrello'], ['#checkout', 'checkout']]) {
    globalThis.location.hash = hash;
    assert.equal(D.router.parse().name, name, hash);
  }
  globalThis.location.hash = '#cart/../x';
  assert.equal(D.router.parse(), null);
});

// ---- the generated pages
function pagesCheck() {
  return execFileSync('python3', [join(root, 'tools/build-pages.py'), '--check'], { encoding: 'utf8', stdio: 'pipe' });
}

test('no Italian is left on an English page, and every phrase a script asks for is in the dictionary', () => {
  assert.match(pagesCheck(), /ok: the English pages have no untranslated Italian/);
});

test('the dictionary is complete and clean', () => {
  for (const [it, en] of Object.entries(dict)) {
    assert.ok(typeof en === 'string' && en.trim(), `empty translation for: ${it}`);
    const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(placeholders(en), placeholders(it), `placeholders differ: ${it}`);
    assert.ok(!/[àèéìòù]/.test(en.replace(/La Bottega dei Parrucchieri|Salernitana/g, '')), `Italian accents in the English text: ${en}`);
  }
});

// ---- links
const htmlFiles = (dir) => readdirSync(join(root, dir), { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => join(dir, f));
const SERVED = [
  [/^\/en\/?$/, () => 'en/index.html'], [/^\/$/, () => 'index.html'],
  [/^\/(shop|ordine)$/, (m) => `${m[1]}.html`], [/^\/servizi$/, () => 'servizi.html'],
  [/^\/en\/(shop|order)$/, (m) => `en/${m[1]}.html`], [/^\/en\/services$/, () => 'en/services.html'],
  [/^\/(prodotti|servizi)\/([\w-]+)$/, (m) => `${m[1]}/${m[2]}.html`], [/^\/en\/(products|services)\/([\w-]+)$/, (m) => `en/${m[1]}/${m[2]}.html`],
];
function resolves(href) {
  const path = href.split('#')[0].split('?')[0];
  if (!path || !path.startsWith('/')) return true;
  for (const [re, file] of SERVED) { const m = re.exec(path); if (m) return existsSync(join(root, file(m))); }
  return existsSync(join(root, path.slice(1))) && statSync(join(root, path.slice(1))).isFile();
}

test('every internal link of every page leads to a page that exists, in the same language', () => {
  for (const file of ['index.html', ...htmlFiles('en'), 'shop.html', 'servizi.html', 'ordine.html', ...htmlFiles('prodotti'), ...htmlFiles('servizi')]) {
    const html = read(file);
    const english = file.startsWith('en/');
    for (const [tag, href] of html.matchAll(/<[a-z]+[^>]*?\bhref="([^"]*)"[^>]*>/g).map((m) => [m[0], m[1]])) {
      if (/^(https?:|tel:|mailto:|#|data:)/.test(href)) continue;
      assert.ok(resolves(href), `${file}: broken link ${href}`);
      const switcher = /class="lang-sw"/.test(tag);   // the language link is the one place an English page may point at Italian
      if (english && !switcher && /^\/(shop|servizi|prodotti|ordine)\b/.test(href)) assert.fail(`${file}: English page links to the Italian ${href}`);
    }
  }
});

test('each page links to its twin in the other language, and says so with hreflang', () => {
  const pairs = [['index.html', 'en/index.html', '/', '/en/'], ['shop.html', 'en/shop.html', '/shop', '/en/shop'],
    ['servizi.html', 'en/services.html', '/servizi', '/en/services'], ['ordine.html', 'en/order.html', '/ordine', '/en/order'],
    ['prodotti/wax-powder.html', 'en/products/wax-powder.html', '/prodotti/wax-powder', '/en/products/wax-powder'],
    ['servizi/skin-fade.html', 'en/services/skin-fade.html', '/servizi/skin-fade', '/en/services/skin-fade']];
  for (const [itFile, enFile, itUrl, enUrl] of pairs) {
    const it = read(itFile), en = read(enFile);
    assert.match(it, new RegExp(`<a class="lang-sw"[^>]*href="${enUrl}"[^>]*hreflang="en"`), itFile);
    assert.match(en, new RegExp(`<a class="lang-sw"[^>]*href="${itUrl}"[^>]*hreflang="it"`), enFile);
    for (const html of [it, en]) {
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="it" href="https://darta-demo.netlify.app${itUrl}">`));
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="https://darta-demo.netlify.app${enUrl}">`));
    }
    assert.match(en, /<html lang="en">/);
    assert.match(it, /<html lang="it">/);
    assert.match(en, /<script defer src="\/js\/en\.js"><\/script>\n<script defer src="\/js\/vendor\/anime/);   // dictionary before everything else
    assert.ok(!it.includes('/js/en.js'), `${itFile} must not load the English dictionary`);
  }
});

test('English product and service pages use the translated copy', () => {
  const wax = read('en/products/wax-powder.html');
  assert.match(wax, /Volumising powder/);
  assert.match(wax, /How to use/);
  assert.match(wax, /Add <span class="opt">to cart<\/span> · €20/);
  assert.ok(!/Polvere|Aggiungi|carrello/.test(wax.replace(/<script[\s\S]*?<\/script>/g, '')));
  const fade = read('en/services/skin-fade.html');
  assert.match(fade, /Book this service/);
  assert.match(fade, /data-service="Skin fade"/);
  assert.match(read('en/services/taglio-e-barba.html'), /Haircut &amp; beard/);
  assert.match(read('en/services.html'), /from €60|€35/);
  assert.match(read('en/index.html'), /3 services · from €12|4 services · from €15/);
});

test('the English dictionary file for the scripts is generated and complete', () => {
  const js = read('js/en.js');
  const m = /window\.DARTA_EN=(\{[\s\S]*\});/.exec(js);
  assert.ok(m, 'js/en.js has the wrong shape');
  const generated = JSON.parse(m[1]);
  assert.ok(Object.keys(generated).length > 60);
  for (const [it, en] of Object.entries(generated)) assert.equal(dict[it], en, it);
  assert.ok(js.length < 20000, 'the dictionary should stay small');
});
