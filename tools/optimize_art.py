#!/usr/bin/env python3
"""Пережать PNG интерфейса без видимой потери качества.

Зачем. Значки интерфейса весили по 135 КБ штука при размере 250x270 — это
PNG-32 без всякой обработки, а показываются они по 20-66 пикселей. На телефоне
такой набор не успевает прийти к моменту открытия вкладки, и она «дорисовывается
по мере необходимости»: сначала текст, потом значки один за другим. Ровно это и
заметил автор.

Как. Палитра на 256 цветов (FASTOCTREE, с альфой) — для рисованной графики с
ограниченным набором тонов это даёт 5-6 крат и на глаз не отличается. Но верить
этому на слово нельзя, поэтому каждый файл ПРОВЕРЯЕТСЯ: считается средняя
абсолютная ошибка по всем каналам, и если она выше порога — файл остаётся как
был. Ни один кадр не портится молча.

Запуск: python3 tools/optimize_art.py [папка ...]   (по умолчанию images/ui)
"""
from PIL import Image, ImageChops
import os, sys, glob, statistics

# Ошибку меряем НА РАЗМЕРЕ ПОКАЗА, а не в полном разрешении. Разница
# принципиальная: в полном размере львиную долю ошибки даёт дизеринг на
# полупрозрачных кромках, которого при уменьшении в четыре раза не остаётся и
# следа. Значок в 250 пикселей показывается по 20-66 — судить надо по тому, что
# видит глаз, иначе порог отвергает файлы, отличить которые невозможно.
VIEW_PX = 64         # характерный размер показа
MAX_MAE_VIEW = 2.0   # средняя ошибка на канал при показе (0..255)
MAX_MAE_FULL = 8.0   # страховка: совсем грубую потерю не пропускаем и так
MIN_GAIN = 1.15      # меньше 15% выигрыша — не стоит и переписывать


def mae(a, b):
    diff = ImageChops.difference(a.convert("RGBA"), b.convert("RGBA"))
    hist = diff.histogram()
    total = 0.0
    n = 0
    for ch in range(4):                      # R,G,B,A по 256 корзин каждый
        base = ch * 256
        for v in range(256):
            c = hist[base + v]
            total += c * v
            n += c
    return total / max(1, n)


def process(path):
    before = os.path.getsize(path)
    im = Image.open(path)
    if im.mode not in ("RGBA", "RGB", "P", "LA", "L"):
        return before, before, "пропуск (режим %s)" % im.mode
    rgba = im.convert("RGBA")
    q = rgba.quantize(colors=256, method=Image.FASTOCTREE)
    tmp = path + ".tmp"
    q.save(tmp, format="PNG", optimize=True)
    after = os.path.getsize(tmp)
    def shrink(img):
        c = img.convert("RGBA").copy()
        c.thumbnail((VIEW_PX, VIEW_PX), Image.LANCZOS)
        return c
    err_view = mae(shrink(rgba), shrink(q))
    err_full = mae(rgba, q)
    gain = before / max(1, after)
    if err_view > MAX_MAE_VIEW or err_full > MAX_MAE_FULL or gain < MIN_GAIN:
        os.remove(tmp)
        return before, before, "оставлен (на показе %.2f, полная %.2f, выигрыш %.2fx)" % (err_view, err_full, gain)
    os.replace(tmp, path)
    return before, after, "на показе %.2f" % err_view


dirs = sys.argv[1:] or ["images/ui"]
grand_b = grand_a = 0
for d in dirs:
    files = sorted(glob.glob(os.path.join(d, "*.png")))
    tb = ta = 0
    kept = []
    for f in files:
        b, a, note = process(f)
        tb += b; ta += a
        if b == a:
            kept.append("%s — %s" % (os.path.basename(f), note))
    grand_b += tb; grand_a += ta
    print("%-20s %3d файлов: %6.1f МБ -> %6.1f МБ (%.1fx)"
          % (d, len(files), tb / 1048576, ta / 1048576, tb / max(1, ta)))
    for k in kept:
        print("   не тронут: " + k)
if len(dirs) > 1:
    print("итого: %.1f МБ -> %.1f МБ (%.1fx)" % (grand_b / 1048576, grand_a / 1048576, grand_b / max(1, grand_a)))
