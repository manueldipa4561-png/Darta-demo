#!/usr/bin/env python3
"""Turns the frames written by tools/render-loops.html (tools/_frames/<slug>/<nnnn>.webp, transparent) into the shop-card loops img/v/<slug>.mp4.

Each frame is laid over the same background the card paints in CSS (a dark base, a soft glow in the product's colour from
data/catalog.json look.glow, a faint light at the bottom), so the video melts into the card. H.264, 30 fps, no audio.
  python3 tools/encode-loops.py              all products found in tools/_frames
  python3 tools/encode-loops.py curl-man     one product
  python3 tools/encode-loops.py --sheet      also write tools/_frames/<slug>/sheet.png (8 frames side by side) to check the look
Needs Pillow and PyAV (pip install pillow av)."""
import json, math, os, sys
import av
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, 'tools', '_frames')
OUT = os.path.join(ROOT, 'img', 'v')
FPS, SIZE, CRF = 30, 640, 24
BASE = (15, 18, 17)                                            # keep in sync with .pcard-media in css/shop.css


def backdrop(glow):
    """The .pcard-media background: base colour, a white light rising from below, the product-coloured glow on top."""
    img = Image.new('RGB', (SIZE, SIZE), BASE)
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = BASE
            u, v = x / SIZE, y / SIZE
            d = math.hypot((u - .5) / .9, (v - 1.08) / .5)       # radial-gradient(90% 50% at 50% 108%, rgba(255,255,255,.05), transparent 70%)
            if d < .7:
                a = .05 * (1 - d / .7)
                r, g, b = r + a * (255 - r), g + a * (255 - g), b + a * (255 - b)
            d = math.hypot((u - .5) / .6, (v - .44) / .52)       # radial-gradient(60% 52% at 50% 44%, rgba(glow,.22), transparent 72%)
            if d < .72:
                a = .22 * (1 - d / .72)
                r, g, b = r + a * (glow[0] - r), g + a * (glow[1] - g), b + a * (glow[2] - b)
            px[x, y] = (round(r), round(g), round(b))
    return img


def encode(slug, glow, sheet):
    folder = os.path.join(FRAMES, slug)
    names = sorted(n for n in os.listdir(folder) if n.endswith('.webp'))
    if not names:
        return
    bg = backdrop(glow)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, slug + '.mp4')
    out = av.open(path, 'w', options={'movflags': 'faststart'})
    st = out.add_stream('libx264', rate=FPS)
    st.width = st.height = SIZE
    st.pix_fmt = 'yuv420p'
    st.options = {'crf': str(CRF), 'preset': 'slow', 'tune': 'animation'}
    keep = []
    step = max(1, len(names) // 8)
    for i, n in enumerate(names):
        fr = Image.open(os.path.join(folder, n)).convert('RGBA')
        comp = bg.copy().convert('RGBA')
        comp.alpha_composite(fr)
        comp = comp.convert('RGB')
        if sheet and i % step == 0 and len(keep) < 8:
            keep.append(comp.resize((320, 320)))
        for pkt in st.encode(av.VideoFrame.from_image(comp)):
            out.mux(pkt)
    for pkt in st.encode():
        out.mux(pkt)
    out.close()
    if sheet and keep:
        s = Image.new('RGB', (320 * 4, 320 * 2))
        for i, im in enumerate(keep):
            s.paste(im, ((i % 4) * 320, (i // 4) * 320))
        s.save(os.path.join(folder, 'sheet.png'))
    print(f'{slug}: {len(names)} frames -> img/v/{slug}.mp4 ({os.path.getsize(path) // 1024} KB)')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sheet = '--sheet' in sys.argv
    cat = json.load(open(os.path.join(ROOT, 'data', 'catalog.json')))
    for p in cat['products']:
        if args and p['slug'] not in args:
            continue
        if os.path.isdir(os.path.join(FRAMES, p['slug'])):
            encode(p['slug'], (p.get('look') or {}).get('glow') or [108, 192, 184], sheet)


if __name__ == '__main__':
    main()
