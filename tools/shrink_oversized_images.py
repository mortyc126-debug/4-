#!/usr/bin/env python3
"""
Уменьшает картинки, которые физически крупнее всего, что игра когда-либо
показывает на экране.

Речь не о качестве, а о том, что часть исходников просто не в масштабе:
рядом лежат тридцать иконок построек по 640px и ~100КБ, и две — по 1536px и
2МБ; значок строительства нарисован 1254x1254 при кнопке в 56 CSS-пикселей;
небо для 3D — 1774px, хотя движок (engine/src/textures.ts, loadTexture,
maxSize=1024) всё равно ужимает любую текстуру до 1024 ПЕРЕД закачкой в
видеопамять, то есть лишние пиксели скачиваются и выбрасываются.

Приводим их к тому размеру, который реально используется. Формат и
прозрачность не трогаем: PNG остаётся PNG, альфа остаётся альфой.

Запуск:
    python3 tools/shrink_oversized_images.py --check
    python3 tools/shrink_oversized_images.py
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (файл, предельная сторона, обоснование)
TARGETS = [
    ("images/ui/icon-build-fab.png", 224,
     "кнопка #mp-build-fab — 56x56 CSS-пикселей (см. её CSS), 224 = запас на экраны с четырёхкратной плотностью"),
    ("images/buildings/market.png", 640,
     "иконка постройки на карте города — у всех остальных 34 построек сторона <=640"),
    ("images/buildings/alliance.png", 640,
     "то же, что и market.png — привести к масштабу остальных иконок построек"),
    ("textures/sky/sky.png", 1024,
     "движок сам ужимает текстуры до 1024 перед закачкой в видеопамять (engine/src/textures.ts, maxSize)"),
]


def main():
    check_only = "--check" in sys.argv
    before = after = 0
    for rel, side, why in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print(f"  {rel}: нет файла, пропуск")
            continue
        sz = os.path.getsize(path)
        im = Image.open(path)
        w, h = im.size
        if max(w, h) <= side:
            print(f"  {rel}: уже {w}x{h}, пропуск")
            before += sz
            after += sz
            continue
        k = side / max(w, h)
        nw, nh = max(1, round(w * k)), max(1, round(h * k))
        out = im.resize((nw, nh), Image.LANCZOS)
        tmp = path + ".tmp"
        out.save(tmp, "PNG", optimize=True)
        nz = os.path.getsize(tmp)
        if check_only:
            os.remove(tmp)
        else:
            os.replace(tmp, path)
            # перечитать и убедиться, что файл валиден и нужного размера
            chk = Image.open(path)
            assert chk.size == (nw, nh), f"{rel}: размер после записи {chk.size}"
            assert chk.mode == im.mode, f"{rel}: режим изменился {im.mode} -> {chk.mode}"
        before += sz
        after += nz
        print(f"  {rel}: {w}x{h} -> {nw}x{nh}, {sz/1024:.0f}К -> {nz/1024:.0f}К")
        print(f"      почему: {why}")
    print()
    print(f"{'БЫЛО БЫ' if check_only else 'ИТОГО'}: {before/1048576:.2f} -> {after/1048576:.2f} МБ "
          f"(−{(before-after)/1048576:.2f} МБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
