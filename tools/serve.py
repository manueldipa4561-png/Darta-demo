#!/usr/bin/env python3
"""Local dev server: python3 tools/serve.py   then open http://127.0.0.1:4173

Behaves like the Netlify site: the same security headers from netlify.toml (so CSP problems show up while you work), the same clean URLs
(/shop, /servizi, /prodotti/<name>, /servizi/<name>), no caching. Also accepts POST /__save/img/p/<name>.webp, used only by
tools/render-images.html to write the rendered product pictures. Never deploy this file's save endpoint: /tools answers 404 on Netlify."""
import http.server, socketserver, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
PORT = 4173
toml = open('netlify.toml').read()
block = re.search(r'for = "/\*"\n  \[headers.values\]\n(.*?)\n\n', toml, re.S).group(1)
HEADERS = []
for line in block.splitlines():
    m = re.match(r'\s*([\w-]+) = "(.*)"\s*$', line)
    if m and m.group(1) != 'Strict-Transport-Security':          # no HSTS / upgrade-insecure-requests on plain http
        HEADERS.append((m.group(1), m.group(2).replace('; upgrade-insecure-requests', '')))
SAVE_OK = re.compile(r'^img/p/[a-z0-9-]+\.webp$')


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        for k, v in HEADERS:
            self.send_header(k, v)
        super().end_headers()

    def rewrite(self, path):                  # the clean URLs netlify.toml rewrites
        q = ''
        if '?' in path:
            path, q = path.split('?', 1)
            q = '?' + q
        if path.rstrip('/') in ('/shop', '/servizi', '/ordine'):
            return path.rstrip('/') + '.html' + q
        if re.match(r'^/(prodotti|servizi)/[\w-]+$', path) and os.path.exists(ROOT + path + '.html'):
            return path + '.html' + q
        return path + q

    def do_GET(self):
        self.path = self.rewrite(self.path)
        super().do_GET()

    def do_HEAD(self):
        self.path = self.rewrite(self.path)
        super().do_HEAD()

    def do_POST(self):
        if not self.path.startswith('/__save/'):
            self.send_error(404)
            return
        name = self.path[len('/__save/'):]
        if not SAVE_OK.match(name):
            self.send_error(400)
            return
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        os.makedirs(os.path.dirname(os.path.join(ROOT, name)), exist_ok=True)
        with open(os.path.join(ROOT, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), H) as s:
        print(f'http://127.0.0.1:{PORT}  (Ctrl+C to stop)')
        s.serve_forever()
