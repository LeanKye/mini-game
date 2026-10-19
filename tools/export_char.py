"""Экспорт анимаций персонажа MUGEN (SFF v1 + AIR) в пиксельные PNG.

    python3 tools/export_char.py <папка-персонажа> <имя.sff> <имя.air> <папка-вывода> <масштаб>

Кадры: idle, walk, attack, attack2, kick, hurt, knock. Номера действий - стандартные для MUGEN.
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from export_hero import read_sff, parse_air, load_frame  # noqa: E402

ACTIONS = {'idle': 0, 'walk': 20, 'attack': 200, 'attack2': 205, 'kick': 210, 'hurt': 5000, 'knock': 5030}
COLORS = 32


def main(folder, sff_name, air_name, out, scale, act_path=None):
    os.makedirs(out, exist_ok=True)
    act_pal = open(act_path, 'rb').read()[:768] if act_path else None
    sprites = read_sff(os.path.join(folder, sff_name), act_pal)
    actions = parse_air(os.path.join(folder, air_name))
    manifest = {}
    skipped = []
    for name, act in ACTIONS.items():
        frames = []
        for g, n, ticks in actions.get(act, []):
            if (g, n) not in sprites:
                continue
            try:
                im = load_frame(sprites, (g, n))[0]
            except OSError:
                # повреждённый кадр в архиве: пропускаем, остальные кадры используются
                skipped.append((g, n))
                continue
            w = max(1, round(im.width * scale))
            h = max(1, round(im.height * scale))
            small = im.resize((w, h), Image.BOX)
            alpha = small.getchannel('A').point(lambda a: 255 if a > 128 else 0)
            q = small.convert('RGB').quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
            q.putalpha(alpha)
            fname = f'{name}_{len(frames):02d}.png'
            q.save(os.path.join(out, fname))
            frames.append({'file': fname, 'ticks': ticks, 'w': w, 'h': h})
        if frames:
            manifest[name] = {'action': act, 'frames': frames}
    if skipped:
        print(f"пропущено повреждённых кадров: {len(skipped)}")
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    return manifest


if __name__ == '__main__':
    act = sys.argv[6] if len(sys.argv) > 6 else None
    m = main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5]), act)
    for k, v in m.items():
        print(f"{k}: {len(v['frames'])} кадров")
