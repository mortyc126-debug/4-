#!/usr/bin/env python3
"""
Переводит НЕПРОЗРАЧНЫЕ картинки из PNG в JPEG.

PNG сжимает без потерь — и на фотографических, шумных изображениях (земля,
кора, вода, небо, нарисованная карта города) платит за это вчетверо большим
весом, чем JPEG при качестве, которое глазом не отличить. Это самая тяжёлая
часть того, что игрок скачивает после моделей.

Трогаем только те файлы, у которых альфа-канала нет вовсе или он сплошь
непрозрачный: у листвы, кустов, травы и облаков вырез по контуру — там JPEG
неприменим, они остаются PNG.

Качество 92 с отключённым прореживанием цветности (subsampling=0): на
тайловых текстурах прореживание даёт заметные цветные разводы на стыках,
а стоит оно немного. Замеренная ошибка — 2-3 из 255 в среднем; движок к
тому же сам пересэмплирует текстуры до 1024 перед закачкой в видеопамять
(engine/src/textures.ts), так что до экрана доходит ещё меньше.

Скрипт печатает список путей, которые нужно поправить в коде, и сам ничего
в коде не меняет — ссылки правятся отдельно и осознанно.

Запуск:
    python3 tools/png_to_jpeg_opaque.py --check
    python3 tools/png_to_jpeg_opaque.py
"""
import glob
import io
import os
import sys

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUALITY = 92
# Порог, выше которого файл считается испорченным переводом и не заменяется.
MAX_MEAN_ERROR = 6.0    # из 255; замеренный максимум по нашим файлам ~3.5


def opaque(im):
    """Есть ли у картинки хоть один по-настоящему прозрачный пиксель."""
    if im.mode not in ("RGBA", "LA", "PA") and "transparency" not in im.info:
        return True
    return im.convert("RGBA").getchannel("A").getextrema()[0] == 255


def mean_error(a, b):
    d = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    h = d.histogram()
    total = count = 0
    for ch in range(3):
        for v in range(256):
            c = h[ch * 256 + v]
            total += v * c
            count += c
    return total / max(1, count)


def main():
    check_only = "--check" in sys.argv
    targets = sorted(glob.glob(os.path.join(ROOT, "textures", "**", "*.png"), recursive=True))
    targets.append(os.path.join(ROOT, "city-map.png"))

    before = after = 0
    renamed = []
    for path in targets:
        if not os.path.exists(path):
            continue
        rel = os.path.relpath(path, ROOT)
        im = Image.open(path)
        if not opaque(im):
            print(f"  {rel}: есть прозрачность — оставляем PNG")
            before += os.path.getsize(path)
            after += os.path.getsize(path)
            continue
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=QUALITY, optimize=True, subsampling=0)
        data = buf.getvalue()
        err = mean_error(im, Image.open(io.BytesIO(data)))
        if err > MAX_MEAN_ERROR:
            print(f"  {rel}: ошибка перевода {err:.2f} выше порога {MAX_MEAN_ERROR} — оставляем PNG")
            before += os.path.getsize(path)
            after += os.path.getsize(path)
            continue
        sz = os.path.getsize(path)
        dst = os.path.splitext(path)[0] + ".jpg"
        before += sz
        after += len(data)
        renamed.append((rel, os.path.relpath(dst, ROOT)))
        print(f"  {rel} -> {os.path.relpath(dst, ROOT)}: {sz/1024:.0f}К -> {len(data)/1024:.0f}К, ошибка {err:.2f}/255")
        if check_only:
            continue
        with open(dst, "wb") as fh:
            fh.write(data)
        chk = Image.open(dst)
        assert chk.size == im.size, f"{rel}: размер изменился {im.size} -> {chk.size}"
        os.remove(path)

    print()
    print(f"{'БЫЛО БЫ' if check_only else 'ИТОГО'}: {before/1048576:.1f} -> {after/1048576:.1f} МБ "
          f"(−{(before-after)/1048576:.1f} МБ), файлов переведено: {len(renamed)}")
    if renamed:
        print("\nПоправить ссылки в коде:")
        for a, b in renamed:
            print(f"  {a}  ->  {b}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
