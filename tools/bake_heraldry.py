#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Печёт атласы гербов союзов из авторского набора
craftpix-net-716070-free-heraldry-constructor-pixel-art.zip.

ЗАЧЕМ ЭТО ВООБЩЕ АТЛАСЫ. В наборе 598 картинок, и все они —
ОДНОБИТНЫЕ МАСКИ: одна сплошная краска плюс прозрачность, цвета в файлах
нет вовсе. Цвет задаётся при сборке, в игре (см. HERALD_TINCTURE в
index.html). Значит:

  * шестьсот запросов к серверу ради герба не нужны — хватает трёх
    картинок, по одной на слой;
  * весят они копейки: маска сжимается PNG'ом почти в ничто (три атласа
    вместе — единицы килобайт);
  * из тех же масок собирается любое сочетание цветов, а их сотни тысяч.

ЧТО ОТОБРАНО И ПОЧЕМУ НЕ ВСЁ. Из ста делений поля взяты 24 — классические
и различимые в 32×48 (рассечение, пересечение, четверочастное, перевязь,
крест, косой крест, стропило, шахматы, кайма и т.д.); остальные при таком
размере читаются одинаковой рябью. Из 211 фигур взяты 40, вразброс по
всем девяти разделам набора, — по одному-двум узнаваемым силуэтам на
зверя плюс башня, замок, книга, якорь, пчела, мечи и молот. Формы щита
взяты все одиннадцать: их и так мало, и каждая своя.
Сочетаний из этого: 11 форм × 25 делений (24 + «гладкое поле») × 41 фигурой
(40 + «без фигуры») × 9 тинктур в трёх местах — больше восьми миллионов.

ПОРЯДОК КАДРОВ В АТЛАСЕ ВАЖЕН. Герб хранится числами (alliances.emblem),
и число — это НОМЕР КАДРА. Переставьте кадры местами — и у всех союзов
мира молча сменятся гербы. Списки ниже поэтому дописываются только в
КОНЕЦ, а порядок существующих не трогается никогда.

Запуск (нужен pillow):
    python3 tools/bake_heraldry.py
"""
import io
import os
import zipfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, "craftpix-net-716070-free-heraldry-constructor-pixel-art.zip")
OUT = os.path.join(ROOT, "images", "heraldry")

SHAPE_W, SHAPE_H = 32, 48
CHARGE_W, CHARGE_H = 32, 32

# Формы щита — все одиннадцать. 0 — прямоугольное полотнище (знамя), дальше
# собственно щиты разного кроя.
SHAPES = [f"5 Shield shape/32x48/{i}.png" for i in range(11)]

# Деления поля. Номера — имена файлов набора (Division48_NN.png), отобраны
# по контрольному листу; порядок здесь и есть порядок кадров.
DIVISIONS = [2, 3, 4, 5, 6, 8, 11, 15, 16, 18, 20, 23,
             25, 26, 27, 28, 41, 42, 43, 59, 60, 84, 88, 93]

# Фигуры. Номера — имена файлов набора (Heraldic_charges_NN.png).
CHARGES = [31, 33, 34, 37, 38,          # львы
           1, 3, 4, 7,                  # медведи
           12, 13, 14, 17, 20,          # птицы
           41, 42, 44,                  # быки
           71, 74, 77,                  # кошки
           51, 52, 54, 57,              # кони
           61, 63, 64, 69,              # псы
           21, 23, 25,                  # змеи
           83, 87, 88, 90, 91, 92, 94, 98, 100]   # прочее


def mask_from(zf, name):
    """Слой набора — однобитная маска. Возвращаем её как белый силуэт с
    альфой: цвет всё равно назначается в игре, белый удобнее отлаживать."""
    with zf.open(name) as fh:
        im = Image.open(io.BytesIO(fh.read())).convert("RGBA")
    a = im.getchannel("A")
    out = Image.new("RGBA", im.size, (255, 255, 255, 255))
    out.putalpha(a)
    return out


def strip(frames, w, h):
    """Кадры в одну горизонтальную ленту — так атлас читается одной строкой
    арифметики и в игре (кадр N начинается на N*w), и глазом."""
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, (i * w, 0))
    return sheet


def main():
    if not os.path.exists(ZIP):
        print("не найден архив набора:", ZIP)
        return 1
    os.makedirs(OUT, exist_ok=True)
    zf = zipfile.ZipFile(ZIP)
    names = set(zf.namelist())

    def need(n):
        if n not in names:
            raise SystemExit("в архиве нет файла: " + n)
        return n

    jobs = [
        ("shapes.png", [need(p) for p in SHAPES], SHAPE_W, SHAPE_H),
        ("divisions.png",
         [need(f"1 Division of the field/32x48/Division48_{n:02d}.png") for n in DIVISIONS],
         SHAPE_W, SHAPE_H),
        ("charges.png",
         [need(f"4 Heraldic charges/All/Heraldic_charges_{n:02d}.png") for n in CHARGES],
         CHARGE_W, CHARGE_H),
    ]
    total = 0
    for fname, paths, w, h in jobs:
        frames = [mask_from(zf, p) for p in paths]
        for im in frames:
            if im.size != (w, h):
                raise SystemExit(f"{fname}: кадр не {w}x{h}, а {im.size}")
        sheet = strip(frames, w, h)
        dest = os.path.join(OUT, fname)
        # optimize + палитровый режим: маска — это два цвета, в RGBA её
        # держать незачем.
        sheet.save(dest, optimize=True)
        size = os.path.getsize(dest)
        total += size
        print(f"  {fname}: {len(frames)} кадров {w}x{h} -> {sheet.size[0]}x{sheet.size[1]}, {size} байт")
    print(f"ИТОГО: {total} байт в images/heraldry/")
    print("ВНИМАНИЕ: порядок кадров — это и есть хранимый номер герба.")
    print("Дописывать списки можно только в конец; переставлять — нельзя.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
