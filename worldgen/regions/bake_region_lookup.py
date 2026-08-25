#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Печёт компактную карту «какой регион в этой клетке» для КЛИЕНТА
(heightmap/region-map-v1.bin) поверх regions-v1.bin.

Зачем отдельный файл. Исходный regions-v1.bin — тексель на клетку мира,
2.88 МБ: столько ради одной подписи в панели не качают. Клиенту нужна не
геометрия региона, а ответ «как называется место, куда ты ткнул», и точность
тут не нужна вовсе: границы регионов сами по себе нарисованы линией в три
клетки. Понижаем разрешение в LOOKUP_STEP раз — 600×300 = 176 КБ, в
шестнадцать раз меньше.

Сушу НЕ маскируем, в отличие от bake_regions_overlay.py: там маска нужна,
чтобы не красить море, а тут наоборот — ткнув в прибрежную воду, игрок
должен получить имя ближайшего берега, а не «нет региона». В море далеко от
суши стоит 255 (нет региона), как и в самом regions-v1.bin.

Выбор значения на блок — по БОЛЬШИНСТВУ, а не по левому верхнему углу:
у самой границы двух регионов угловая выборка дала бы имя соседа.

Формат: uint8, LOOKUP_W×LOOKUP_H, строки сверху вниз, та же сетка осей, что
и у heightmap/*.bin (px = world_x + 1200, py = world_z + 600), только
делённая на LOOKUP_STEP. 255 = региона нет.

ВНИМАНИЕ при перегенерации регионов. Имена областей лежат в index.html
(REGION_NAMES) и привязаны к ЗНАЧЕНИЮ в файле, то есть к id региона минус
один: в regions-v1.bin нумерация с нуля, в regions_meta.json — с единицы.
Перезапустите generate_regions.py — и области поменяются местами вместе с
номерами, а имена останутся на прежних позициях: «Гремучие Пики» уедут в
степь. Проверять надо оба файла разом.

Запуск:
  python3 worldgen/regions/bake_region_lookup.py
"""
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
WORLD_W, WORLD_H = 2400, 1200
LOOKUP_STEP = 4
LOOKUP_W, LOOKUP_H = WORLD_W // LOOKUP_STEP, WORLD_H // LOOKUP_STEP


def main():
    raw = np.fromfile(SCRIPT_DIR / "regions-v1.bin", dtype=np.uint8)
    assert raw.size == WORLD_W * WORLD_H, "regions-v1.bin не того размера"
    rm = raw.reshape(WORLD_H, WORLD_W)

    # (H/step, step, W/step, step) -> для каждого блока список его клеток
    blocks = rm.reshape(LOOKUP_H, LOOKUP_STEP, LOOKUP_W, LOOKUP_STEP)
    blocks = blocks.transpose(0, 2, 1, 3).reshape(LOOKUP_H, LOOKUP_W, LOOKUP_STEP * LOOKUP_STEP)
    # мода по блоку: bincount на 256 значений, для каждого блока — argmax
    counts = np.zeros((LOOKUP_H, LOOKUP_W, 256), dtype=np.uint8)
    idx0, idx1 = np.meshgrid(np.arange(LOOKUP_H), np.arange(LOOKUP_W), indexing="ij")
    for k in range(blocks.shape[2]):
        counts[idx0, idx1, blocks[..., k]] += 1
    out = counts.argmax(axis=2).astype(np.uint8)

    out_path = REPO_ROOT / "heightmap" / "region-map-v1.bin"
    out.tofile(out_path)
    known = int((out != 255).sum())
    print("написано:", out_path, f"({out.size} байт, {LOOKUP_W}x{LOOKUP_H}, шаг {LOOKUP_STEP})")
    print("блоков с регионом:", known, f"({100*known/out.size:.1f}%)")
    print("регионы в файле:", sorted(int(v) for v in np.unique(out) if v != 255))


if __name__ == "__main__":
    main()
