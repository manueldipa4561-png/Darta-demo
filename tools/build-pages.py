#!/usr/bin/env python3
"""Builds the static pages of the site from data/catalog.json, data/services.json and the shared parts of index.html.

    python3 tools/build-pages.py          (run from anywhere; writes into the repository)

Writes:   shop.html                    -> /shop
          servizi.html                 -> /servizi
          prodotti/<slug>.html         -> /prodotti/<slug>     one page per product
          servizi/<slug>.html          -> /servizi/<slug>      one page per service
Updates:  the service-group teaser on the home page (between <!--gen:svc-groups--> markers)

The header, footer, cart drawer, checkout and booking sheet are copied from the <!--shared:...--> blocks of index.html, and the
inline pre-paint script is copied byte for byte (the CSP allows exactly one hash). No dependencies, no build step on Netlify:
the generated files are committed. Edit the data files or index.html, run this, commit the result.
"""
import html as H
import json
import os
import re

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


def eur(c):
    return f"{c // 100}€" if c % 100 == 0 else f"{c / 100:.2f}".replace('.', ',') + '€'


CAT = json.loads(read('data/catalog.json'))
SVC = json.loads(read('data/services.json'))
INDEX = read('index.html')
PRODUCTS = CAT['products']
BYID = {p['id']: p for p in PRODUCTS}
CATLABEL = {c['id']: c['label'] for c in CAT['cats']}
GROUP = {g['id']: g for g in SVC['groups']}
SERVICES = SVC['services']
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
        return 'da ' + eur(p['variants'][0]['price'])
    return eur(p['price']) + (' /mese' if p.get('recurring') else '')


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
def page(title, desc, body_class, main, scripts, og=None, jsonld=None, preload_catalog=True):
    ld = ''
    if jsonld:
        ld = '\n<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False).replace('</', '<\\/') + '</script>'
    og_img = f'\n<meta property="og:image" content="{og}">' if og else ''
    pre = '\n<link rel="preload" as="fetch" href="/data/catalog.json" crossorigin="anonymous">' if preload_catalog else ''
    js = '\n'.join(f'<script defer src="/js/{s}"></script>' for s in ['vendor/anime.umd.min.js'] + scripts)
    return f'''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="noindex">
<meta name="darta-demo" content="1">
<meta name="theme-color" content="#0b0b0a">
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


def crumbs(*items):
    out = ['<a href="/">Home</a>']
    for i, it in enumerate(items):
        out.append('<span aria-hidden="true">/</span>')
        out.append(f'<a href="{it[1]}">{esc(it[0])}</a>' if it[1] else f'<span aria-current="page">{esc(it[0])}</span>')
    return '<nav class="crumbs" aria-label="Percorso">' + ''.join(out) + '</nav>'


# ---------------------------------------------------------------- shop
def card(p, i):
    quick = not p.get('variants')
    badge = f'<span class="pcard-badge">Risparmi {eur(kit_saving(p))}</span>' if kit_saving(p) > 0 else ''
    label = f'{p["name"]}, {price_text(p)}. Apri la pagina del prodotto'
    if quick:
        buy = (f'<button class="pcard-add" type="button" data-add="{p["id"]}" aria-label="Aggiungi {esc(p["name"])} al carrello">{icon("s-plus")}</button>')
    else:
        buy = (f'<a class="pcard-add" href="/prodotti/{p["slug"]}" aria-label="Scegli l\'importo: {esc(p["name"])}">{icon("s-arrow")}</a>')
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
        <p class="count num" id="shopCount" aria-live="polite">{len(PRODUCTS)} prodotti</p>
      </div>
      <div class="shelf" id="shelf">
{cards}
      </div>
      <p class="note shop-note">Prodotti, prezzi e descrizioni sono d'esempio per la demo e da confermare con il salone. Nessun pagamento reale.</p>
    </div>
  </section>
</main>'''
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'url': f'/prodotti/{p["slug"]}', 'name': p['name']} for i, p in enumerate(PRODUCTS)]}
    return page('Shop | Darta Barber Studio, Pescara',
                "Lo shop di Darta Barber Studio: wax powder, argilla, pomata, olio barba, sea salt spray, kit e gift card. Ritiro gratis in salone o spedizione in Italia.",
                'page-shop', main, ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'shop.js', 'main.js'], og=thumb(PRODUCTS[0]), jsonld=ld)


# ---------------------------------------------------------------- product pages
def product_page(p):
    v = default_variant(p)
    is_try = p['kind'] in ('jar', 'dropper', 'spray', 'powder')
    badge = f'<span class="pcard-badge pdp-badge">Risparmi {eur(kit_saving(p))}</span>' if kit_saving(p) > 0 else ''
    variants = ''
    if p.get('variants'):
        chips = ''.join(f'<label><input type="radio" name="pv" value="{x["id"]}" data-price="{x["price"]}"{" checked" if x is v else ""}><span>{esc(x["label"])}</span></label>' for x in p['variants'])
        variants = f'<fieldset class="fld" id="ppVars"><legend>Importo</legend><div class="chips">{chips}</div></fieldset>'
    specs = ''.join(f'<div class="spec"><dt>{esc(k)}</dt><dd><span class="pips" role="img" aria-label="{n} su 5">' + ''.join(f'<i class="{"on" if j < n else ""}"></i>' for j in range(5)) + '</span></dd></div>' for k, n in p.get('specs', []))
    use = ''.join(f'<li>{esc(t)}</li>' for t in p.get('use', []))
    contains = ''
    if p.get('items'):
        contains = '<div class="pp-contains"><h2 class="h3">Nel kit</h2><div class="more">' + ''.join(mini(BYID[i]) for i in p['items']) + '</div></div>'
    more = ''.join(mini(x) for x in related_products(p))
    try_btn = f'<button type="button" class="pdp-try" id="ppTry" hidden>{icon("i-play")}<span id="ppTryTxt">Apri</span></button>' if is_try else ''
    unit = unit_price(p)
    add_label = f'Aggiungi <span class="opt">al carrello</span> · {eur(unit)}'
    price = eur(unit) + (' /mese' if p.get('recurring') else '')
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
          'offers': {'@type': 'Offer', 'priceCurrency': 'EUR', 'price': f'{unit / 100:.2f}', 'availability': 'https://schema.org/InStock', 'url': f'/prodotti/{p["slug"]}'}}
    return page(f'{p["name"]} | Shop Darta Barber Studio', f'{p["name"]}: {p["short"]} {p["desc"]}'[:300], 'page-product', main,
                ['core.js', 'store.js', 'pay.js', 'product-gl.js', 'cart.js', 'motion.js', 'product.js', 'main.js'], og=thumb(p), jsonld=ld)


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
                ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'order.js', 'main.js'], preload_catalog=False)


# ---------------------------------------------------------------- services
def svc_price(s):
    return ('da ' if s.get('from') else '') + eur(s['price'])


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
        {'@type': 'ListItem', 'position': i + 1, 'url': f'/servizi/{s["slug"]}', 'name': s['name']} for i, s in enumerate(SERVICES)]}
    return page('Servizi e listino | Darta Barber Studio, Pescara',
                'Servizi di Darta Barber Studio: taglio uomo, skin fade, barba a lama, rasatura tradizionale, combo. Prezzi e durate, prenota dall\'app.',
                'page-services', main, ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'main.js'], jsonld=ld, preload_catalog=False)


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
    return page(f'{s["name"]} | Servizi Darta Barber Studio', f'{s["name"]}, {s["time"]}, {svc_price(s)}. {s["desc"]}'[:300], 'page-service', main,
                ['core.js', 'store.js', 'pay.js', 'cart.js', 'motion.js', 'main.js'], jsonld=ld, preload_catalog=False)


# ---------------------------------------------------------------- home teaser (kept in sync with the data)
def update_home_groups():
    items = ''
    for g in SVC['groups']:
        ss = [s for s in SERVICES if s['group'] == g['id']]
        lowest = min(s['price'] for s in ss)
        items += f'<li><a href="/servizi#{g["id"]}"><b>{esc(g["label"])}</b><span>{len(ss)} serviz{"i" if len(ss) != 1 else "io"} · da {eur(lowest)}</span></a></li>'
    new = f'<!--gen:svc-groups--><ul class="svc-groups rv">{items}</ul><!--/gen:svc-groups-->'
    out = re.sub(r'<!--gen:svc-groups-->.*?<!--/gen:svc-groups-->', lambda m: new, INDEX, flags=re.S)
    if out != INDEX:
        write('index.html', out)
        print('updated  index.html (service groups)')


def main():
    write('shop.html', shop_page()); print('wrote    shop.html')
    write('servizi.html', services_page()); print('wrote    servizi.html')
    write('ordine.html', order_page()); print('wrote    ordine.html')
    for p in PRODUCTS:
        write(f'prodotti/{p["slug"]}.html', product_page(p))
    print(f'wrote    prodotti/ ({len(PRODUCTS)} pages)')
    for s in SERVICES:
        write(f'servizi/{s["slug"]}.html', service_page(s))
    print(f'wrote    servizi/ ({len(SERVICES)} pages)')
    update_home_groups()


if __name__ == '__main__':
    main()
