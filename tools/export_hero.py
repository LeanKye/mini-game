"""Экспорт анимаций героини из MUGEN (SFF v1 + AIR) в пиксельные PNG для игры.

    python3 tools/export_hero.py assets/mugen/Kanae_Kanata assets/game/hero

Кадры уменьшаются в 2 раза (BOX), палитра сокращается до 32 цветов, прозрачность берётся из палитры MUGEN.
Пишет manifest.json: действие -> список кадров (файл, длительность в тиках).
"""
import io
import json
import os
import re
import struct
import sys

from PIL import Image

ACTIONS = {
    'idle': 0,
    'walk': 20,
    'jab': 40,
    'punch2': 41,
    'punch3': 42,
    'kick': 44,
    'heavy': 47,
    'air': 180,
    'hurt': 5,
    'knock': 251,
    'dash': 410,
    'special': 800,
}
SCALE = 0.5
COLORS = 32


def read_sff(path):
    # записи с флагом same_pal используют палитру последней записи с собственной палитрой
    d = open(path, 'rb').read()
    sprites = {}
    off = 512
    seen = 0
    last_pal = None
    while off and off + 32 < len(d) and seen < 4000:
        seen += 1
        nxt, ln, x, y, g, n, _l, same = struct.unpack('<IIhhHHHB', d[off:off + 19])
        if ln:
            body = d[off + 32:off + 32 + ln]
            if same and last_pal is not None:
                body = body + last_pal
            else:
                last_pal = body[-768:]
            sprites[(g, n)] = (x, y, body)
        off = nxt
    return sprites


def load_frame(sprites, key):
    x, y, body = sprites[key]
    im = Image.open(io.BytesIO(body))
    indices = bytes(0 if v == 0 else 255 for v in im.getdata())
    mask = Image.frombytes('L', im.size, indices)
    rgba = im.convert('RGBA')
    rgba.putalpha(mask)
    return rgba, x, y


def parse_air(path):
    txt = open(path, 'rb').read().decode('latin-1')
    actions = {}
    cur = None
    for line in txt.splitlines():
        s = line.strip()
        m = re.match(r'\[Begin Action (\d+)\]', s, re.I)
        if m:
            cur = int(m.group(1))
            actions[cur] = []
            continue
        if cur is not None and re.match(r'^-?\d+\s*,', s):
            p = [v.strip() for v in s.split(',')]
            if len(p) >= 5 and p[4].lstrip('-').isdigit():
                actions[cur].append((int(p[0]), int(p[1]), int(p[4])))
    return actions


def main(src, out):
    os.makedirs(out, exist_ok=True)
    sprites = read_sff(os.path.join(src, 'Kanae_Kanata.sff'))
    actions = parse_air(os.path.join(src, 'Kanae_Kanata.air'))
    manifest = {}
    cache = {}
    for name, act in ACTIONS.items():
        frames = []
        for (g, n, ticks) in actions.get(act, []):
            if (g, n) not in sprites:
                continue
            key = (g, n)
            if key not in cache:
                cache[key] = load_frame(sprites, key)[0]
            im = cache[key]
            w = max(1, round(im.width * SCALE))
            h = max(1, round(im.height * SCALE))
            small = im.resize((w, h), Image.BOX)
            alpha = small.getchannel('A').point(lambda a: 255 if a > 128 else 0)
            q = small.convert('RGB').quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
            q.putalpha(alpha)
            fname = f'{name}_{len(frames):02d}.png'
            q.save(os.path.join(out, fname))
            frames.append({'file': fname, 'ticks': ticks, 'w': w, 'h': h})
        if frames:
            manifest[name] = {'action': act, 'frames': frames}
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    return manifest


if __name__ == '__main__':
    m = main(sys.argv[1], sys.argv[2])
    for k, v in m.items():
        print(f"{k}: {len(v['frames'])} кадров")
