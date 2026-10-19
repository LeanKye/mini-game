"""Распаковка спрайтов MUGEN SFF v1 (PCX внутри) в PNG.

    python3 tools/sff1_extract.py <файл.sff> <папка-вывода>

Имена файлов: group_number.png, оси X/Y записаны в sprites.json рядом.
"""
import io
import json
import os
import struct
import sys

from PIL import Image


def extract(path, out_dir):
    d = open(path, 'rb').read()
    if d[:12] != b'ElecbyteSpr\x00':
        raise SystemExit('не SFF v1: нет сигнатуры ElecbyteSpr')
    ver = d[12:16]
    if ver[3] != 1:
        raise SystemExit(f'неподдерживаемая версия SFF: {ver.hex()}')
    # заголовок SFF v1 всегда 512 байт, первая подзапись сразу после него
    first = 512
    sub_size = 32
    count = 0
    os.makedirs(out_dir, exist_ok=True)
    index = []
    prev_pal = None
    off = first
    seen = 0
    while off and off + sub_size < len(d) and seen < 2000:
        seen += 1
        nxt, length, x, y, group, number, linked, same_pal = struct.unpack('<IIhhHHHB', d[off:off + 19])
        body = d[off + sub_size:off + sub_size + length]
        if length:
            if same_pal and prev_pal is not None:
                body = body + prev_pal
            try:
                img = Image.open(io.BytesIO(body)).convert('RGBA')
            except Exception as e:
                index.append({'group': group, 'number': number, 'error': str(e)[:60]})
                off = nxt
                continue
            pal_tail = body[-768:]
            if not same_pal:
                prev_pal = pal_tail
            name = f'{group}_{number}.png'
            img.save(os.path.join(out_dir, name))
            index.append({'group': group, 'number': number, 'x': x, 'y': y,
                          'w': img.width, 'h': img.height, 'file': name})
        off = nxt
    json.dump(index, open(os.path.join(out_dir, 'sprites.json'), 'w'), indent=1)
    return index


if __name__ == '__main__':
    idx = extract(sys.argv[1], sys.argv[2])
    print(f'распаковано спрайтов: {len(idx)}')
