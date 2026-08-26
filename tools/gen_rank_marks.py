#!/usr/bin/env python3
"""Заглушки знаков боевых званий — images/ranks/rank-<key>.png.

ЭТО ВРЕМЕННАЯ ГРАФИКА. Знаки рисуются процедурно, чтобы интерфейс званий не
стоял пустым до настоящих ассетов: диск-печать с кольцом, римским номером
ступени столба и цветом по ярусу. Когда появятся настоящие рисунки — просто
положить файлы с теми же именами поверх, в коде менять нечего.

Запуск: python3 tools/gen_rank_marks.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 128
OUT = os.path.join(os.path.dirname(__file__), "..", "images", "ranks")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

# (ключ, римский номер яруса, цвет кольца, цвет заливки, цвет чернил)
UP = [
    ("recruit",  "I",    (122, 100, 72), (58, 48, 34), (214, 198, 168)),
    ("guard",    "II",   (140, 116, 80), (64, 54, 38), (222, 208, 178)),
    ("knight",   "III",  (158, 132, 88), (70, 58, 40), (232, 218, 188)),
    ("hero",     "IV",   (176, 146, 94), (76, 62, 42), (240, 228, 198)),
    ("legend",   "V",    (194, 153, 60), (82, 66, 40), (250, 238, 206)),
    ("overlord", "VI",   (208, 168, 66), (88, 70, 40), (255, 244, 214)),
    ("deity",    "VII",  (224, 186, 76), (94, 74, 40), (255, 248, 224)),
    ("titan",    "VIII", (240, 206, 96), (100, 78, 40), (255, 252, 236)),
]
DOWN = [
    ("dishonoured", "I",    (110, 60, 62), (52, 30, 32), (214, 170, 172)),
    ("branded",     "II",   (124, 62, 62), (56, 30, 32), (220, 168, 170)),
    ("oathbreaker", "III",  (138, 62, 62), (60, 30, 32), (226, 164, 166)),
    ("darkadept",   "IV",   (150, 58, 60), (64, 28, 30), (232, 158, 160)),
    ("cursed",      "V",    (162, 54, 58), (68, 26, 28), (238, 152, 154)),
    ("destroyer",   "VI",   (174, 50, 54), (72, 24, 26), (244, 146, 148)),
    ("chaoslord",   "VII",  (186, 46, 50), (76, 22, 24), (248, 140, 142)),
    ("worldender",  "VIII", (198, 42, 46), (80, 20, 22), (252, 134, 136)),
]


def mark(key, roman, ring, fill, ink):
    # ×4 и уменьшение в конце — дешёвое сглаживание без внешних зависимостей.
    s = SIZE * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = s // 16
    d.ellipse([pad, pad, s - pad, s - pad], fill=fill + (255,), outline=ring + (255,), width=s // 22)
    inner = pad + s // 11
    d.ellipse([inner, inner, s - inner, s - inner], outline=ring + (150,), width=s // 60)
    f = ImageFont.truetype(FONT, int(s * (0.30 if len(roman) > 3 else 0.36)))
    bb = d.textbbox((0, 0), roman, font=f)
    d.text(((s - bb[2] - bb[0]) / 2, (s - bb[3] - bb[1]) / 2 - s * 0.02), roman, font=f, fill=ink + (255,))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
n = 0
for key, roman, ring, fill, ink in UP + DOWN:
    mark(key, roman, ring, fill, ink).save(os.path.join(OUT, "rank-%s.png" % key))
    n += 1
# «Звания ещё нет» — пока идёт калибровка. Пустая печать без номера.
im = Image.new("RGBA", (SIZE * 4, SIZE * 4), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
p = SIZE * 4 // 16
d.ellipse([p, p, SIZE * 4 - p, SIZE * 4 - p], fill=(46, 40, 30, 255), outline=(96, 84, 64, 255), width=SIZE * 4 // 22)
d.ellipse([p + SIZE * 4 // 11, p + SIZE * 4 // 11, SIZE * 4 - p - SIZE * 4 // 11, SIZE * 4 - p - SIZE * 4 // 11],
          outline=(96, 84, 64, 120), width=SIZE * 4 // 60)
im.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, "rank-none.png"))
n += 1
print("готово, знаков: %d -> images/ranks/" % n)
