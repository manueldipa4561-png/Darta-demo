#!/usr/bin/env python3
"""Builds the static pages of the site from data/catalog.json, data/services.json and the shared parts of index.html.

    python3 tools/build-pages.py          (run from anywhere; writes into the repository)

Writes:   shop.html                    -> /shop
          servizi.html                 -> /servizi
          ordine.html                  -> /ordine
          prodotti/<slug>.html         -> /prodotti/<slug>     one page per product
          servizi/<slug>.html          -> /servizi/<slug>      one page per service
          en/index.html, en/shop.html, en/services.html, en/order.html, en/products/<slug>.html, en/services/<slug>.html
                                       -> the same pages in English under /en/
          js/en.js                     -> the Italian->English dictionary the scripts use on the English pages
Updates:  the service-group teaser on the home page (between <!--gen:svc-groups--> markers)

English: data/en.json maps each Italian phrase to its English version, data/catalog.en.json and data/services.en.json hold the
translated product and service copy. Run with --check to build everything in memory and fail if an English page still has Italian
in it, or a script asks for a phrase the dictionary does not have.

The header, footer, cart drawer, checkout and booking sheet are copied from the <!--shared:...--> blocks of index.html, and the
inline pre-paint script is copied byte for byte (the CSP allows exactly one hash). No dependencies, no build step on Netlify:
the generated files are committed. Edit the data files or index.html, run this, commit the result.
"""
import html as H
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n

SITE = 'https://darta-demo.netlify.app'   # absolute URLs for hreflang; change when the domain changes
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: H.escape(str(s), quote=True)


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def write(p, s):
    full = os.path.join(ROOT, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(s)


LANG = 'it'


def eur(c):
    if LANG == 'en':
        return f"€{c // 100}" if c % 100 == 0 else f"€{c / 100:.2f}"
    return f"{c // 100}€" if c % 100 == 0 else f"{c / 100:.2f}".replace('.', ',') + '€'


MAP = json.loads(read('data/en.json'))


def tr(s, **kw):
    """A phrase made in Python (it has numbers or prices in it): Italian as written, or its English version."""
    out = MAP.get(s, s) if LANG == 'en' else s
    for k, v in kw.items():
        out = out.replace('{' + k + '}', str(v))
    return out


CAT_IT = json.loads(read('data/catalog.json'))
SVC_IT = json.loads(read('data/services.json'))
CAT_EN = json.loads(read('data/catalog.en.json'))
SVC_EN = json.loads(read('data/services.en.json'))
INDEX = read('index.html')
CAT = SVC = PRODUCTS = BYID = CATLABEL = GROUP = SERVICES = None


def merged(base, over):
    """base with the translated fields of `over` laid on top (dicts merge, everything else is replaced)."""
    if isinstance(base, dict) and isinstance(over, dict):
        return {k: merged(base[k], over[k]) if k in over else base[k] for k in base}
    return over


def set_lang(lang):
    """Points the generator at the Italian data or the English data (the Italian files with the translated fields laid on top)."""
    global LANG, CAT, SVC, PRODUCTS, BYID, CATLABEL, GROUP, SERVICES
    LANG = lang
    CAT, SVC = CAT_IT, SVC_IT
    if lang == 'en':
        CAT = dict(CAT_IT, coupons=merged(CAT_IT['coupons'], CAT_EN['coupons']),
                   cats=[dict(c, label=CAT_EN['cats'][c['id']]) for c in CAT_IT['cats']],
                   products=[merged(p, CAT_EN['products'][p['id']]) for p in CAT_IT['products']])
        SVC = dict(SVC_IT, note=SVC_EN['note'],
                   groups=[merged(g, SVC_EN['groups'][g['id']]) for g in SVC_IT['groups']],
                   services=[merged(x, SVC_EN['services'][x['slug']]) for x in SVC_IT['services']])
    PRODUCTS = CAT['products']
    BYID = {p['id']: p for p in PRODUCTS}
    CATLABEL = {c['id']: c['label'] for c in CAT['cats']}
    GROUP = {g['id']: g for g in SVC['groups']}
    SERVICES = SVC['services']


set_lang('it')
TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='


def shared(name):
    m = re.search(r'<!--shared:%s-->(.*?)<!--/shared:%s-->' % (name, name), INDEX, re.S)
    if not m:
        raise SystemExit('missing shared block: ' + name)
    return m.group(1)


INLINE = re.search(r'<script>/\* set layout flags.*?</script>', INDEX, re.S).group(0)
icon = lambda i: f'<svg class="i" aria-hidden="true"><use href="#{i}"/></svg>'


# ---------------------------------------------------------------- data helpers
def default_variant(p):
    return (p['variants'][1] if len(p['variants']) > 1 else p['variants'][0]) if p.get('variants') else None


def price_text(p):
    if p.get('variants'):
        return tr('da {price}', price=eur(p['variants'][0]['price']))
    return tr('{price} /mese', price=eur(p['price'])) if p.get('recurring') else eur(p['price'])


def unit_price(p):
    v = default_variant(p)
    return v['price'] if v else p['price']


def kit_saving(p):
    return sum(BYID[i]['price'] for i in p['items']) - p['price'] if p.get('items') else 0


def related_products(p):
    others = [x for x in PRODUCTS if x['id'] != p['id']]
    return ([x for x in others if x['cat'] != p['cat']] + [x for x in others if x['cat'] == p['cat']])[:3]


def thumb(p, w='a'):
    return f"/img/p/{p['slug']}-{w}.webp"


def mini(p):
    return (f'<a class="mini" href="/prodotti/{p["slug"]}"><img src="{thumb(p)}" alt="" width="96" height="96" loading="lazy" decoding="async">'
            f'<span><b>{esc(p["name"])}</b><small>{esc(price_text(p))}</small></span></a>')


# ---------------------------------------------------------------- page shell
LEFT = []   # Italian text found on English pages without a translation (reported by --check)


def switch_link(alt):
    """The language link of the header: on an Italian page it leads to the English twin, and the other way round."""
    if LANG == 'it':
        return f'<a class="lang-sw" id="langSw" href="{alt}" hreflang="en" lang="en" aria-label="Read this site in English">EN</a>'
    return f'<a class="lang-sw" id="langSw" href="{alt}" hreflang="it" lang="it" aria-label="Leggi il sito in italiano">IT</a>'


def set_switch(html, alt):
    out, n = re.subn(r'<a class="lang-sw"[^>]*>.*?</a>', lambda m: switch_link(alt), html, count=1, flags=re.S)
    if n != 1:
        raise SystemExit('the header has no language link (<a class="lang-sw">)')
    return out


def alternates(urls):
    return (f'<link rel="alternate" hreflang="it" href="{SITE}{urls["it"]}">\n'
            f'<link rel="alternate" hreflang="en" href="{SITE}{urls["en"]}">\n'
            f'<link rel="alternate" hreflang="x-default" href="{SITE}{urls["it"]}">')


def finish(html, urls):
    """Last step of every page: on the English ones, translate it, point its links at /en/, load the dictionary."""
    if LANG == 'en':
        html, left = i18n.translate_html(html, MAP)
        LEFT.extend(left)
        html = i18n.localize_links(html)
        html = html.replace('<html lang="it">', '<html lang="en">', 1)
        html = html.replace('<script defer src="/js/vendor/anime.umd.min.js"></script>',
                            '<script defer src="/js/en.js"></script>\n<script defer src="/js/vendor/anime.umd.min.js"></script>', 1)
        html = html.replace('<link rel="preload" as="fetch" href="/data/catalog.json" crossorigin="anonymous">',
                            '<link rel="preload" as="fetch" href="/data/catalog.json" crossorigin="anonymous">\n'
                            '<link rel="preload" as="fetch" href="/data/catalog.en.json" crossorigin="anonymous">', 1)
    return set_switch(html, urls['en' if LANG == 'it' else 'it'])


U = lambda h: i18n.localize_href(h) if LANG == 'en' else h


def page(title, desc, body_class, main, scripts, urls, og=None, jsonld=None, preload_catalog=True):
    ld = ''
    if jsonld:
        ld = '\n<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False).replace('</', '<\\/') + '</script>'
    og_img = f'\n<meta property="og:image" content="{og}">' if og else ''
    pre = '\n<link rel="preload" as="fetch" href="/data/catalog.json" crossorigin="anonymous">' if preload_catalog else ''
    js = '\n'.join(f'<script defer src="/js/{s}"></script>' for s in ['vendor/anime.umd.min.js'] + scripts)
    html = f'''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="noindex">
<meta name="darta-demo" content="1">
<meta name="theme-color" content="#0b0b0a">
{alternates(urls)}
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">{og_img}
<link rel="icon" href="/img/logo.png">
<link rel="preload" as="font" type="font/woff2" href="/fonts/BarlowCondensed-800.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/Barlow-400.woff2" crossorigin>{pre}
{INLINE}
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/shop.css">
<link rel="stylesheet" href="/css/pages.css">{ld}
</head>
<body class="page-inner {body_class}">

{shared('sprite')}
{shared('header')}

{main}

{shared('footer')}

{shared('tail')}
{shared('dialogs')}

{js}
</body>
</html>
'''
    return finish(html, urls)


def crumbs(*items):
    out = ['<a href="/">Home</a>']
    for i, it in enumerate(items):
        out.append('<span aria-hidden="true">/</span>')
        out.append(f'<a href="{it[1]}">{esc(it[0])}</a>' if it[1] else f'<span aria-current="page">{esc(it[0])}</span>')
    return '<nav class="crumbs" aria-label="Percorso">' + ''.join(out) + '</nav>'


# ---------------------------------------------------------------- shop
def card(p, i):
    quick = not p.get('variants')
    badge = f'<span class="pcard-badge">{esc(tr("Risparmi {amount}", amount=eur(kit_saving(p))))}</span>' if kit_saving(p) > 0 else ''
    label = tr('{name}, {price}. Apri la pagina del prodotto', name=p['name'], price=price_text(p))
    add_aria = esc(tr('Aggiungi {name} al carrello', name=p['name']))
    choose_aria = esc(tr("Scegli l'importo: {name}", name=p['name']))
    if quick:
        buy = f'<button class="pcard-add" type="button" data-add="{p["id"]}" aria-label="{add_aria}">{icon("s-plus")}</button>'
    else:
        buy = f'<a class="pcard-add" href="/prodotti/{p["slug"]}" aria-label="{choose_aria}">{icon("s-arrow")}</a>'
    feature = ' feature' if p.get('items') else ''
    return f'''<article class="pcard rv shot{feature}" data-id="{p["id"]}" data-cat="{p["cat"]}" style="--i:{i % 4}">
  <a class="pcard-media" href="/prodotti/{p["slug"]}" aria-label="{esc(label)}">
    <span class="pcard-no">/{p["no"]}</span>
    <span class="pcard-glow" aria-hidden="true"></span>
    <img class="pcard-img a ready" src="{thumb(p)}" alt="" width="640" height="640" loading="{'eager' if i < 2 else 'lazy'}" decoding="async">
    <img class="pcard-img b" src="{TRANSPARENT}" data-src="{thumb(p, 'b')}" alt="" width="640" height="640" decoding="async">
    {badge}
  </a>
  <div class="pcard-body">
    <div><h2 class="pcard-name"><a href="/prodotti/{p["slug"]}">{esc(p["name"])}</a></h2><p class="pcard-tag">{esc(p["tag"])} · {esc(p["size"])}</p></div>
    <div class="pcard-buy"><span class="pcard-price num">{esc(price_text(p))}</span>{buy}</div>
  </div>
</article>'''


PERKS = (f'<ul class="perks"><li>{icon("s-store")}Ritiro gratis in salone</li><li>{icon("s-truck")}Spedizione gratis da 40&euro;</li>'
         f'<li>{icon("s-gift")}Gift card in un minuto</li></ul>')


def shop_page():
    filters = ''.join(f'<button class="fbtn" type="button" data-cat="{c["id"]}" aria-pressed="{"true" if c["id"] == "tutti" else "false"}">{esc(c["label"])}</button>' for c in CAT['cats'])
    cards = '\n'.join(card(p, i) for i, p in enumerate(PRODUCTS))
    main = f'''<main id="top">
  <section class="sec shop shop-top" aria-labelledby="shopTitle">
    <div class="wrap">
      {crumbs(('Shop', None))}
      <div class="shop-head">
        <div>
          <p class="eyebrow rv">/ Shop online</p>
          <h1 class="d h2" id="shopTitle" style="margin-top:1rem"><span class="ln"><span class="rv">Il banco</span></span><span class="ln"><span class="rv" style="--i:1">di <em>Thomas.</em></span></span></h1>
        </div>
        <div class="shop-side">
          <p class="lead rv">Quello che usa sulla poltrona, da portare a casa. Ritiro gratis in salone oppure spedizione in tutta Italia.</p>
          {PERKS}
        </div>
      </div>
      <div class="shop-bar">
        <div class="filters" id="filters" role="group" aria-label="Filtra per categoria">{filters}</div>
        <p class="count num" id="shopCount" aria-live="polite">{esc(tr("{n} prodotti", n=len(PRODUCTS)))}</p>
      </div>
      <div class="shelf" id="shelf">
{cards}
      </div>
      <p class="note shop-note">Prodotti, prezzi e descrizioni sono d'esempio per la demo e da confermare con il salone. Nessun pagamento reale.</p>
    </div>
  </section>
</main>'''
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'url': U(f'/prodotti/{p["slug"]}'), 'name': p['name']} for i, p in enumerate(PRODUCTS)]}
    return page('Shop | Darta Barber Studio, Pescara',
                "Lo shop di Darta Barber Studio: wax powder, argilla, pomata, olio barba, sea salt spray, kit e gift card. Ritiro gratis in salone o spedizione in Italia.",
                'page-shop', main, ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'shop.js', 'main.js'], {'it': '/shop', 'en': '/en/shop'},
                og=thumb(PRODUCTS[0]), jsonld=ld)


# ---------------------------------------------------------------- product pages
def product_page(p):
    v = default_variant(p)
    is_try = p['kind'] in ('jar', 'dropper', 'spray', 'powder')
    badge = f'<span class="pcard-badge pdp-badge">{esc(tr("Risparmi {amount}", amount=eur(kit_saving(p))))}</span>' if kit_saving(p) > 0 else ''
    variants = ''
    if p.get('variants'):
        chips = ''.join(f'<label><input type="radio" name="pv" value="{x["id"]}" data-price="{x["price"]}"{" checked" if x is v else ""}><span>{esc(x["label"])}</span></label>' for x in p['variants'])
        variants = f'<fieldset class="fld" id="ppVars"><legend>Importo</legend><div class="chips">{chips}</div></fieldset>'
    specs = ''.join(f'<div class="spec"><dt>{esc(k)}</dt><dd><span class="pips" role="img" aria-label="{esc(tr("{n} su 5", n=n))}">' + ''.join(f'<i class="{"on" if j < n else ""}"></i>' for j in range(5)) + '</span></dd></div>' for k, n in p.get('specs', []))
    use = ''.join(f'<li>{esc(t)}</li>' for t in p.get('use', []))
    contains = ''
    if p.get('items'):
        contains = '<div class="pp-contains"><h2 class="h3">Nel kit</h2><div class="more">' + ''.join(mini(BYID[i]) for i in p['items']) + '</div></div>'
    more = ''.join(mini(x) for x in related_products(p))
    try_btn = f'<button type="button" class="pdp-try" id="ppTry" hidden>{icon("i-play")}<span id="ppTryTxt">Apri</span></button>' if is_try else ''
    unit = unit_price(p)
    add_label = f'{esc(tr("Aggiungi"))} <span class="opt">{esc(tr("al carrello"))}</span> · {eur(unit)}'
    price = tr('{price} /mese', price=eur(unit)) if p.get('recurring') else eur(unit)
    main = f'''<main id="top" class="pp" data-slug="{p["slug"]}">
  <div class="wrap">
    {crumbs(('Shop', '/shop'), (p['name'], None))}
    <div class="pp-grid">
      <div class="pdp-stage pp-stage" id="ppStage">
        <span class="pdp-no">/{p["no"]} · {esc(CATLABEL.get(p["cat"], p["cat"]))}</span>
        <img class="pdp-fallback" id="ppFallback" src="{thumb(p)}" alt="{esc(p["name"])}" width="640" height="640" fetchpriority="high">
        <div class="pdp-host" id="ppHost"></div>
        {try_btn}
        <p class="pdp-hint" aria-hidden="true">Trascina per ruotare</p>
        <div class="pdp-rot">
          <button type="button" id="ppL" aria-label="Ruota a sinistra">{icon("s-chev-l")}</button>
          <button type="button" id="ppR" aria-label="Ruota a destra">{icon("s-chev-r")}</button>
        </div>
      </div>
      <div class="pp-info">
        {badge}
        <h1 class="d pdp-h" id="ppTitle">{esc(p["name"])}</h1>
        <p class="pdp-tag">{esc(p["tag"])} · {esc(p["size"])}</p>
        <p class="pdp-price num" id="ppPrice">{esc(price)}</p>
        {variants}
        <p class="pdp-desc">{esc(p["desc"])}</p>
        <dl class="specs">{specs}</dl>
        <div class="buy">
          <div class="qty lg" role="group" aria-label="Quantit&agrave;">
            <button type="button" id="ppMinus" aria-label="Meno" disabled>{icon("s-minus")}</button>
            <output class="num" id="ppQ" aria-live="polite">1</output>
            <button type="button" id="ppPlus" aria-label="Pi&ugrave;">{icon("s-plus")}</button>
          </div>
          <button class="btn btn-p add" id="ppAdd" type="button">{icon("s-bag")}<span id="ppAddTxt" aria-live="polite">{add_label}</span></button>
        </div>
        <details class="acc" open><summary>Come si usa</summary><ol>{use}</ol></details>
        <details class="acc"><summary>Consegna e ritiro</summary><p>Ritiro gratuito in salone, Via Gobetti 184, dal marted&igrave; al sabato dalle 10 alle 19. Spedizione in tutta Italia a 4,90&euro;, gratis sopra i 40&euro;. Gift card e abbonamento arrivano via email.</p></details>
        {contains}
      </div>
    </div>
    <section class="pp-more" aria-labelledby="ppMoreTitle"><h2 class="h3" id="ppMoreTitle">Abbinalo con</h2><div class="more">{more}</div></section>
    <p class="note shop-note">Prodotto, prezzo e descrizione sono d'esempio per la demo e da confermare con il salone. Nessun pagamento reale.</p>
  </div>
</main>'''
    ld = {'@context': 'https://schema.org', '@type': 'Product', 'name': p['name'], 'description': p['desc'], 'image': thumb(p),
          'brand': {'@type': 'Brand', 'name': 'Darta Barber Studio'},
          'offers': {'@type': 'Offer', 'priceCurrency': 'EUR', 'price': f'{unit / 100:.2f}', 'availability': 'https://schema.org/InStock', 'url': U(f'/prodotti/{p["slug"]}')}}
    return page(f'{p["name"]} | Shop Darta Barber Studio', f'{p["name"]}: {p["short"]} {p["desc"]}'[:300], 'page-product', main,
                ['core.js', 'store.js', 'pay.js', 'product-gl.js', 'cart.js', 'motion.js', 'product.js', 'main.js'],
                {'it': f'/prodotti/{p["slug"]}', 'en': f'/en/products/{p["slug"]}'}, og=thumb(p), jsonld=ld)


# ---------------------------------------------------------------- order confirmation (Stripe sends the customer back here)
def order_page():
    main = f'''<main id="top">
  <section class="sec ord" aria-labelledby="ordTitle">
    <div class="wrap">
      {crumbs(('Ordine', None))}
      <div class="done-in" id="ordBox" aria-live="polite">
        <p class="eyebrow">/ Il tuo ordine</p>
        <h1 class="d h2sm" id="ordTitle">Controllo il pagamento&hellip;</h1>
        <p class="mono num" id="ordNo" hidden></p>
        <p id="ordTxt"></p>
        <ul class="done-list" id="ordList"></ul>
        <div class="cta-row">
          <a class="btn btn-p" id="ordRetry" href="/shop#carrello" hidden>Torna al carrello</a>
          <a class="btn btn-p" href="/shop">Torna allo shop</a>
          <a class="btn btn-g" id="ordWa" href="https://wa.me/393939031656" target="_blank" rel="noopener noreferrer">Scrivi al salone su WhatsApp</a>
        </div>
      </div>
    </div>
  </section>
</main>'''
    return page('Il tuo ordine | Darta Barber Studio', 'Conferma del tuo ordine su Darta Barber Studio.', 'page-order', main,
                ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'order.js', 'main.js'], {'it': '/ordine', 'en': '/en/order'}, preload_catalog=False)


# ---------------------------------------------------------------- services
def svc_price(s):
    return tr('da {price}', price=eur(s['price'])) if s.get('from') else eur(s['price'])


def svc_row(s, tag='a'):
    return (f'<a class="row" href="/servizi/{s["slug"]}"><span class="n">{esc(s["name"])}</span><span class="t">{esc(s["time"])}</span>'
            f'<span class="p num">{esc(svc_price(s))}</span></a>')


def services_page():
    groups = ''
    for g in SVC['groups']:
        rows = ''.join(svc_row(s) for s in SERVICES if s['group'] == g['id'])
        groups += f'<div class="grp rv" id="{g["id"]}"><h2 class="h3">{esc(g["label"])}</h2>{rows}</div>\n'
    main = f'''<main id="top" class="svc-page">
  <section class="sec" aria-labelledby="svcPageTitle">
    <div class="wrap">
      {crumbs(('Servizi', None))}
      <div class="menu">
        <div class="menu-head">
          <h1 class="d h2" id="svcPageTitle"><span class="ln"><span class="rv">Il listino</span></span></h1>
          <p class="lead rv">Scegli il servizio e il barber direttamente dall'app. Conferma in pochi secondi. Ogni servizio ha la sua pagina con i dettagli.</p>
          <p class="note">{esc(SVC["note"])}</p>
        </div>
        <div>
{groups}          <button type="button" class="btn btn-p" data-book>{icon("i-cal")}Prenota</button>
        </div>
      </div>
    </div>
  </section>
</main>'''
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'url': U(f'/servizi/{s["slug"]}'), 'name': s['name']} for i, s in enumerate(SERVICES)]}
    return page('Servizi e listino | Darta Barber Studio, Pescara',
                'Servizi di Darta Barber Studio: taglio uomo, skin fade, barba a lama, rasatura tradizionale, combo. Prezzi e durate, prenota dall\'app.',
                'page-services', main, ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'main.js'], {'it': '/servizi', 'en': '/en/services'},
                jsonld=ld, preload_catalog=False)


def service_page(s):
    g = GROUP[s['group']]
    steps = ''.join(f'<li>{esc(t)}</li>' for t in s['steps'])
    pairs = [BYID[i] for i in s['pairs'] if i in BYID]
    pairs_html = ''
    if pairs:
        pairs_html = ('<section class="pp-more" aria-labelledby="svcPairs"><h2 class="h3" id="svcPairs">Per tenerlo a casa</h2><div class="more">'
                      + ''.join(mini(x) for x in pairs) + '</div></section>')
    same = [x for x in SERVICES if x['group'] == s['group'] and x['slug'] != s['slug']]
    rest = [x for x in SERVICES if x['group'] != s['group']]
    others = (same + rest)[:3]
    others_html = '<section class="svc-more" aria-labelledby="svcOthers"><h2 class="h3" id="svcOthers">Altri servizi</h2><div class="menu-list">' + ''.join(svc_row(x) for x in others) + '</div></section>'
    main = f'''<main id="top" class="svc-page">
  <div class="wrap">
    {crumbs(('Servizi', '/servizi'), (s['name'], None))}
    <article class="svc-hero">
      <p class="eyebrow">/ {esc(g["label"])}</p>
      <h1 class="d pdp-h svc-h">{esc(s["name"])}</h1>
      <p class="svc-tag">{esc(s["tag"])}</p>
      <ul class="svc-meta"><li><span>Durata</span><b>{esc(s["time"])}</b></li><li><span>Prezzo</span><b class="num">{esc(svc_price(s))}</b></li></ul>
      <p class="lead">{esc(s["desc"])}</p>
      <div class="cta-row"><button type="button" class="btn btn-p" data-book data-service="{esc(s["name"])}">{icon("i-cal")}Prenota questo servizio</button><a class="btn btn-g" href="/servizi">Tutti i servizi</a></div>
    </article>
    <section class="svc-steps" aria-labelledby="svcSteps"><h2 class="h3" id="svcSteps">Come si svolge</h2><ol>{steps}</ol></section>
    {pairs_html}
    {others_html}
    <p class="note shop-note">{esc(SVC["note"])}</p>
  </div>
</main>'''
    ld = {'@context': 'https://schema.org', '@type': 'Service', 'name': s['name'], 'description': s['desc'], 'serviceType': g['label'],
          'provider': {'@type': 'HairSalon', 'name': 'Darta Barber Studio',
                       'address': {'@type': 'PostalAddress', 'streetAddress': 'Via Piero Gobetti 184', 'postalCode': '65129', 'addressLocality': 'Pescara', 'addressCountry': 'IT'}},
          'offers': {'@type': 'Offer', 'priceCurrency': 'EUR', 'price': f'{s["price"] / 100:.2f}'}}
    return page(tr('{name} | Servizi Darta Barber Studio', name=s['name']), f'{s["name"]}, {s["time"]}, {svc_price(s)}. {s["desc"]}'[:300], 'page-service', main,
                ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'main.js'], {'it': f'/servizi/{s["slug"]}', 'en': f'/en/services/{s["slug"]}'},
                jsonld=ld, preload_catalog=False)


# ---------------------------------------------------------------- home page
def groups_html():
    """The service-group teaser of the home page, kept in sync with the data."""
    items = ''
    for g in SVC['groups']:
        ss = [x for x in SERVICES if x['group'] == g['id']]
        lowest = min(x['price'] for x in ss)
        count = tr('{n} servizi · da {price}' if len(ss) != 1 else '{n} servizio · da {price}', n=len(ss), price=eur(lowest))
        items += f'<li><a href="/servizi#{g["id"]}"><b>{esc(g["label"])}</b><span>{esc(count)}</span></a></li>'
    return f'<!--gen:svc-groups--><ul class="svc-groups rv">{items}</ul><!--/gen:svc-groups-->'


GROUPS_RE = r'<!--gen:svc-groups-->.*?<!--/gen:svc-groups-->'


def home_page():
    """index.html (Italian, hand written) or its English twin, translated from it."""
    html = re.sub(GROUPS_RE, lambda m: groups_html(), INDEX, flags=re.S)
    return html if LANG == 'it' else finish(html, {'it': '/', 'en': '/en/'})


# ---------------------------------------------------------------- the dictionary for the scripts
def js_sources():
    d = os.path.join(ROOT, 'js')
    return {f: read('js/' + f) for f in sorted(os.listdir(d)) if f.endswith('.js') and f != 'en.js'}


CALL = re.compile(r"""\b(?:tr|D\.t)\(\s*(['"])((?:\\.|(?!\1).)*)\1""")


def unquote(lit):
    return lit.replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\')


def js_keys():
    """(phrases the scripts ask for with tr('...'), phrases of the dictionary that a script mentions as a plain string)."""
    called, mentioned = set(), set()
    for src in js_sources().values():
        called.update(unquote(m.group(2)) for m in CALL.finditer(src))
        for k in MAP:
            if '<' not in k and any(q + k + q in src for q in ("'", '"')):
                mentioned.add(k)
    return called, mentioned


def en_js():
    called, mentioned = js_keys()
    missing = sorted(k for k in called if k not in MAP)
    if missing:
        LEFT.extend('script asks for a phrase missing from data/en.json: ' + k for k in missing)
    keys = sorted(called | mentioned)
    body = json.dumps({k: MAP[k] for k in keys if k in MAP}, ensure_ascii=False, indent=0, separators=(',', ':')).replace('</', '<\\/')
    return ('/* Italian -> English phrases for the English pages. GENERATED by tools/build-pages.py from data/en.json: do not edit. */\n'
            'window.DARTA_EN=' + body + ';\n')


# ---------------------------------------------------------------- everything
def build_all():
    """{path: content} of every generated file, Italian pages first, then the English ones."""
    out = {}
    set_lang('it')
    out['index.html'] = home_page()
    out['shop.html'] = shop_page()
    out['servizi.html'] = services_page()
    out['ordine.html'] = order_page()
    for p in PRODUCTS:
        out[f'prodotti/{p["slug"]}.html'] = product_page(p)
    for x in SERVICES:
        out[f'servizi/{x["slug"]}.html'] = service_page(x)
    set_lang('en')
    out['en/index.html'] = home_page()
    out['en/shop.html'] = shop_page()
    out['en/services.html'] = services_page()
    out['en/order.html'] = order_page()
    for p in PRODUCTS:
        out[f'en/products/{p["slug"]}.html'] = product_page(p)
    for x in SERVICES:
        out[f'en/services/{x["slug"]}.html'] = service_page(x)
    out['js/en.js'] = en_js()
    set_lang('it')
    return out


def report_left():
    uniq = sorted(set(LEFT))
    for t in uniq:
        print('  untranslated:', t[:140])
    return len(uniq)


def main():
    global INDEX
    check = '--check' in sys.argv
    out = build_all()
    if check:
        n = report_left()
        if n:
            raise SystemExit(f'{n} Italian phrase(s) left on the English pages (add them to data/en.json)')
        print('ok: the English pages have no untranslated Italian,', len(out), 'files would be written')
        return
    n = report_left()
    for path, content in out.items():
        write(path, content)
    print('wrote   ', len(out), 'files (Italian pages, /en/ pages, js/en.js)')
    if n:
        print(f'WARNING: {n} Italian phrase(s) on the English pages have no translation (python3 tools/build-pages.py --check)')


if __name__ == '__main__':
    main()
