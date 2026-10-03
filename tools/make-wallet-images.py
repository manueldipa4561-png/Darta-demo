#!/usr/bin/env python3
"""Draws the Wallet pass pictures that are not photos: the app icon and the stamp strips (0 to 10 stamps).
Pure Python, no dependencies:  python3 tools/make-wallet-images.py   ->  img/wallet/icon*.png, strip-<n>@2x.png
(The logo files next to them come from img/logo.png: sips --resampleHeight 50|100|150 img/logo.png --out img/wallet/logo[@2x|@3x].png)"""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'img', 'wallet')
INK = (11, 11, 10)          # the site's black
CREAM = (239, 233, 223)     # the site's cream
TEAL = (108, 192, 184)      # the stamp colour of the loyalty card
SS = 3                      # sub-samples per pixel side (anti-aliasing)


class Canvas:
    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        # premultiplied RGBA floats, row-major
        fill = (bg[0] / 255, bg[1] / 255, bg[2] / 255, 1.0) if bg else (0.0, 0.0, 0.0, 0.0)
        self.px = [list(fill) for _ in range(w * h)]

    def shape(self, bbox, inside, color, alpha=1.0):
        x0, y0, x1, y1 = bbox
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(self.w, int(math.ceil(x1))), min(self.h, int(math.ceil(y1)))
        r, g, b = (c / 255 for c in color)
        n = SS * SS
        for y in range(y0, y1):
            for x in range(x0, x1):
                hit = 0
                for sy in range(SS):
                    for sx in range(SS):
                        if inside(x + (sx + .5) / SS, y + (sy + .5) / SS):
                            hit += 1
                if not hit:
                    continue
                a = hit / n * alpha
                p = self.px[y * self.w + x]
                k = 1 - a
                p[0] = r * a + p[0] * k
                p[1] = g * a + p[1] * k
                p[2] = b * a + p[2] * k
                p[3] = a + p[3] * k

    def disc(self, cx, cy, r, color, alpha=1.0):
        self.shape((cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1), lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r, color, alpha)

    def ring(self, cx, cy, r, width, color, alpha=1.0):
        ro, ri = r, r - width
        self.shape((cx - ro - 1, cy - ro - 1, cx + ro + 1, cy + ro + 1),
                   lambda x, y: ri * ri <= (x - cx) ** 2 + (y - cy) ** 2 <= ro * ro, color, alpha)

    def stroke(self, pts, width, color, alpha=1.0):
        half = width / 2

        def inside(x, y):
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                dx, dy = bx - ax, by - ay
                t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
                if (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= half * half:
                    return True
            return False
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        self.shape((min(xs) - half - 1, min(ys) - half - 1, max(xs) + half + 1, max(ys) + half + 1), inside, color, alpha)

    def png(self):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)  # filter: none
            for x in range(self.w):
                r, g, b, a = self.px[y * self.w + x]
                if a <= 0:
                    raw += b'\x00\x00\x00\x00'
                else:
                    raw += bytes((min(255, round(r / a * 255)), min(255, round(g / a * 255)), min(255, round(b / a * 255)), min(255, round(a * 255))))

        def chunk(tag, data):
            body = tag + data
            return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
        return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


def icon(size):
    c = Canvas(size, size, INK)
    m = size / 2
    c.ring(m, m, size * .36, max(1.5, size * .09), TEAL)
    c.disc(m, m, size * .13, TEAL)
    return c


def strip(stamps):
    w, h = 750, 246
    c = Canvas(w, h)               # transparent: the pass background colour shows through
    d, gap = 84, 44
    left = (w - (5 * d + 4 * gap)) / 2
    for i in range(10):
        row, col = divmod(i, 5)
        cx = left + d / 2 + col * (d + gap)
        cy = 64 + row * 118
        if i < stamps:
            c.disc(cx, cy, d / 2, TEAL)
            c.stroke([(cx - 17, cy + 1), (cx - 4, cy + 14), (cx + 19, cy - 14)], 9, INK)
        elif i == 9:
            c.ring(cx, cy, d / 2, 7, CREAM, .95)       # the free haircut
            c.disc(cx, cy, 9, CREAM, .95)
        else:
            c.ring(cx, cy, d / 2, 4, CREAM, .5)
    return c


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, name in ((29, 'icon.png'), (58, 'icon@2x.png'), (87, 'icon@3x.png')):
        open(os.path.join(OUT, name), 'wb').write(icon(size).png())
        print('wrote', name)
    for n in range(11):
        open(os.path.join(OUT, f'strip-{n}@2x.png'), 'wb').write(strip(n).png())
        print('wrote', f'strip-{n}@2x.png')


if __name__ == '__main__':
    main()
