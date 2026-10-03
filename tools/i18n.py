"""Italian -> English for the static pages. Used by tools/build-pages.py; no dependencies.

The Italian text is the key: data/en.json maps every Italian phrase of the site to its English version, and the same file feeds
the browser (js/en.js is generated from it), so a phrase is translated once, wherever it is shown.

    translate_html(html, mapping)   -> (english html, [Italian-looking text that has no translation])
    localize_href(href)             -> /prodotti/x -> /en/products/x, /servizi -> /en/services, ...
    looks_italian(text)             -> heuristic used to find phrases that were forgotten
"""
import html as H
import re

# ----------------------------------------------------------------- finding the text
# what is not text: comments, scripts, styles, svg drawings, and tags (whose attributes may hold text)
BLOCKS = re.compile(r'<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>|<svg\b.*?</svg>|<[^>]+>', re.S | re.I)
ATTR = re.compile(r'''(\s(?:alt|title|aria-label|placeholder|content|data-word)=)(?:"([^"]*)"|'([^']*)')''', re.S)

# Italian-only words (never English): a text node containing one of these that has no translation is a leftover
ITALIAN = set('''il lo gli di del dello della dei delle degli al alla alle agli nel nella nei nelle sul sulla dal dalla dalle con per tra
fra che non una uno questo questa questi queste quello quella tutti tutte tutto ogni anche sono sei è più già dove quando poi solo
ancora oggi domani vai scegli prenota prenotazione ordine carrello spedizione ritiro gratis salone aperto chiuso torna scrivi
scrivici riprova codice sconto totale consegna nome cognome telefono città facoltativo importo chiudi apri rimuovi aggiungi meno
pagamento prodotto prodotti servizi servizio orari storia lavori tessera timbri timbra barba capelli taglio tagli vuoto scopri
lunedì martedì mercoledì giovedì venerdì sabato domenica ciao grazie benvenuto'''.split())
WORD = re.compile(r"[a-zàèéìòù]+", re.I)


# Product names that stay Italian on purpose: they are printed on the packaging, so the English shop uses them as they are.
KEEP_NAMES = ('Olio Barba', 'Pomata Shine')


def looks_italian(text):
    for name in KEEP_NAMES:
        text = text.replace(name, ' ')
    t = text.lower()
    if re.search(r'[àèéìòù]', t):
        return True
    return any(w in ITALIAN for w in WORD.findall(t))


def norm(text):
    """The key form of a text node: entities decoded, whitespace collapsed."""
    return re.sub(r'\s+', ' ', H.unescape(text)).strip()


# ----------------------------------------------------------------- links
def localize_href(h):
    """Internal Italian paths -> their /en/ twin. Anything else (external, tel:, assets) is returned unchanged."""
    if h == '/':
        return '/en/'
    if h.startswith('/#'):
        return '/en/' + h[1:]
    rules = [
        (r'^/shop(/?)(#carrello)?$', lambda m: '/en/shop' + ('#cart' if m.group(2) else '')),
        (r'^/servizi(#[\w-]*)?$', lambda m: '/en/services' + (m.group(1) or '')),
        (r'^/servizi/([\w-]+)$', lambda m: '/en/services/' + m.group(1)),
        (r'^/prodotti/([\w-]+)$', lambda m: '/en/products/' + m.group(1)),
        (r'^/ordine$', lambda m: '/en/order'),
        (r'^#carrello$', lambda m: '#cart'),
    ]
    for pat, fn in rules:
        m = re.match(pat, h)
        if m:
            return fn(m)
    return h


def localize_links(html):
    return re.sub(r'(\bhref=)(?:"([^"]*)"|\'([^\']*)\')', lambda m: f'{m.group(1)}"{localize_href(m.group(2) if m.group(2) is not None else m.group(3))}"', html)


# ----------------------------------------------------------------- translating
def translate_html(html, mapping):
    """Replaces every known Italian phrase (text nodes and the text attributes above) by its English version.
    Keys that contain markup are matched as exact `>key<` fragments first (sentences split by <em> or <b>)."""
    left = []
    for key in sorted((k for k in mapping if '<' in k), key=len, reverse=True):
        html = html.replace('>' + key + '<', '>' + mapping[key] + '<')

    flat = {k: v for k, v in mapping.items() if '<' not in k}

    def text(raw):
        key = norm(raw)
        if not key:
            return raw
        if key in flat:
            lead = raw[:len(raw) - len(raw.lstrip())]
            tail = raw[len(raw.rstrip()):]
            return lead + H.escape(flat[key], quote=False) + tail
        if looks_italian(key):
            left.append(key)
        return raw

    def attrs(tag):
        def one(m):
            raw = m.group(2) if m.group(2) is not None else m.group(3)
            key = norm(raw)
            if key in flat:
                return f'{m.group(1)}"{H.escape(flat[key], quote=True)}"'
            if key and looks_italian(key) and not key.startswith(('/', '#', 'http')):
                left.append(key)
            return m.group(0)
        return ATTR.sub(one, tag)

    out, at = [], 0
    for m in BLOCKS.finditer(html):
        out.append(text(html[at:m.start()]))
        tok = m.group(0)
        out.append(attrs(tok) if tok.startswith('<') and not tok.startswith(('<!--', '<script', '<style', '<svg')) else tok)
        at = m.end()
    out.append(text(html[at:]))
    return ''.join(out), left
