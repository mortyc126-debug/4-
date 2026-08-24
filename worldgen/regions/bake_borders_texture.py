#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Печёт текстуру линий границ регионов (regions_borders.png) поверх УЖЕ
посчитанного regions-v1.bin (см. generate_regions.py рядом — этот скрипт
регионы не пересчитывает, только рисует линии по готовому файлу, поэтому и
выполняется за долю секунды, не 30-40с).

Зачем отдельным файлом от generate_regions.py: там граница рисуется поверх
залитых цветом регионов (превью для человека) — в игре так пока не будет,
закраски региона у игрока никогда не увидит (механики регионов/альянсов ещё
нет, см. PLAN.md, это чисто визуальная примерка "как будут смотреться линии
на настоящей 3D-карте"). Тут — прозрачный PNG с одной только линией, без
заливки, чтобы движок мог наложить её поверх настоящей текстуры земли одним
доп. сэмплом в шейдере рельефа (см. engine/src/renderer.ts TERRAIN_SHADER).

Формат выхода — тот же формат осей/масштаба, что и heightmap/*.bin (см.
engine/src/terrain.ts:toPixel — world_x = px-1200, world_z = py-600):
2400×1200, 1 клетка мира = 1 тексель, RGBA, прозрачно всюду кроме границы.

Запуск:
  python3 worldgen/regions/bake_borders_texture.py
Дальше файл нужно руками скопировать в textures/world/regions_borders.png —
именно оттуда его грузит движок (см. её комментарий в renderer.ts).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
WORLD_W, WORLD_H = 2400, 1200

# Ширина сплошного ядра линии, в клетках мира (=текселях, тут 1:1) — шире,
# чем 3px в generate_regions.py: там превью смотрят целиком сверху на
# уменьшенной картинке, тут линия должна читаться с игровой камеры
# (engine/src/camera.ts: MIN_DIST=9..MAX_DIST=140 — крупный масштаб редок,
# тонкая в 1-2 клетки линия на дистанции в десятки клеток попросту потерялась
# бы). SOFT_BLUR_PX — дополнительное мягкое размытие альфы поверх твёрдого
# ядра, "растёкшиеся чернила" вместо жёсткого пиксельного края.
DILATE_PX = 4
SOFT_BLUR_PX = 2.2
CORE_ALPHA = 232
# Тёмно-коричневые чернила — тон в духе темы интерфейса игры (GILT/пергамент/
# "канцелярская книга похода", см. комментарии у renderTop/renderFolio в
# index.html), не чистый чёрный: граница на настоящей текстуре земли должна
# читаться как нарисованная на карте линия, не как трещина в рельефе.
LINE_RGB = (42, 28, 18)


def main():
    bin_path = SCRIPT_DIR / "regions-v1.bin"
    raw = np.fromfile(bin_path, dtype=np.uint8)
    assert raw.size == WORLD_W * WORLD_H, (
        f"{bin_path} не совпадает по размеру с {WORLD_W}x{WORLD_H} — "
        "сначала запустите generate_regions.py, чтобы его создать/обновить"
    )
    rm = raw.reshape(WORLD_H, WORLD_W).astype(np.int16)
    rm[rm == 255] = -1  # 255 = вода/вне региона (см. generate_regions.py)

    # Та же граница по соседям, что и в render_regions() (generate_regions.py)
    # — граница ТОЛЬКО между двумя разными настоящими регионами, не по
    # берегу (вода не считается "соседним регионом").
    border = np.zeros((WORLD_H, WORLD_W), dtype=bool)
    diff_h = (rm[:, :-1] != rm[:, 1:]) & (rm[:, :-1] >= 0) & (rm[:, 1:] >= 0)
    diff_v = (rm[:-1, :] != rm[1:, :]) & (rm[:-1, :] >= 0) & (rm[1:, :] >= 0)
    border[:, :-1] |= diff_h
    border[:, 1:] |= diff_h
    border[:-1, :] |= diff_v
    border[1:, :] |= diff_v

    core = Image.fromarray((border * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * DILATE_PX + 1))
    soft = core.filter(ImageFilter.GaussianBlur(SOFT_BLUR_PX))
    alpha = np.clip(np.array(soft).astype(np.float32) / 255.0 * CORE_ALPHA, 0, 255).astype(np.uint8)

    rgba = np.zeros((WORLD_H, WORLD_W, 4), dtype=np.uint8)
    rgba[..., 0] = LINE_RGB[0]
    rgba[..., 1] = LINE_RGB[1]
    rgba[..., 2] = LINE_RGB[2]
    rgba[..., 3] = alpha

    out_path = SCRIPT_DIR / "regions_borders.png"
    Image.fromarray(rgba, "RGBA").save(out_path)
    print("написано:", out_path)
    print("непрозрачных текселей (alpha>8):", int((alpha > 8).sum()), "из", WORLD_W * WORLD_H)


if __name__ == "__main__":
    main()
