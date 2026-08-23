#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор политических регионов поверх настоящего рельефа игры (тот же
heightmap/elevation-v6.bin + forest.bin + moisture.bin, что грузит движок,
см. engine/src/terrain.ts) — офлайн-инструмент, ВНЕ движка, как и сам
heightmap-пайплайн (см. её же комментарий про "офлайн Python-пайплайн").
Ничего не запускается в игре автоматически — это черновик для показа
масштаба/формы регионов, прежде чем сама механика альянсов будет написана
(см. PLAN.md рядом).

Что делает:
  1. Читает elevation/forest/moisture, определяет сушу (height >= SEA).
  2. Раскидывает N_REGIONS зёрен по суше и выравнивает их по площади
     (релаксация Ллойда на прореженной сетке) — даёт равные "стартовые"
     регионы, только геометрия, без учёта рельефа.
  3. Пересчитывает границы уже "по-Total-War": каждое зерно растекается по
     карте не по прямому расстоянию, а по СТОИМОСТИ прохода (Дейкстра/MCP,
     skimage.graph.MCP_Geometric) — идти в гору или через реку дороже, чем
     по равнине. Где встречаются два фронта разных зёрен — там и граница;
     из-за завышенной стоимости она сама ложится на реки и горные гряды,
     а не режет их по прямой.
  4. Рисует превью (заливка региона поверх рельефа + чёрная граница + номер
     в кружке на центроиде) и пишет "запечённые" данные — region_map,
     region_map_equal_area, метаданные по каждому региону (площадь, зерно,
     центроид) — теми же типами, что и heightmap/*.bin, чтобы будущий
     сервер/движок при желании мог прочитать это напрямую, тем же приёмом,
     что loadHeightmapData() в terrain.ts.

Зависимости — ТОЛЬКО для офлайн-генерации, не для игры:
  pip install numpy pillow scipy scikit-image

Запуск (из корня репозитория или из этой папки — пути ниже уже учитывают
оба случая):
  python3 worldgen/regions/generate_regions.py
"""
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric

# ---- пути -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
HEIGHTMAP_DIR = REPO_ROOT / "heightmap"
OUT_DIR = SCRIPT_DIR

# ---- те же константы, что в engine/src/terrain.ts (держать синхронно!) ----
WORLD_W, WORLD_H = 2400, 1200       # HEIGHT_W/HEIGHT_H
ELEV_SCALE = 2.5
SEA = 0.235
HEIGHTMAP_VERSION = 6

# ---- параметры генерации регионов ------------------------------------------
N_REGIONS = 16
SEED = 7                            # фиксирован — детерминированный результат между запусками
LLOYD_ITERS = 10                    # релаксация зёрен по площади (шаг 2 из шапки файла)
DOWNSAMPLE = 2                      # даунсемпл для Дейкстры (2400x1200 -> 1200x600) — MCP
                                     # на полном разрешении не нужен: граница всё равно
                                     # апсемплится назад nearest-neighbor, а речные русла (см.
                                     # ниже "all()") при блочном "все под-пиксели суша" не теряются
MOUNTAIN_COST_K = 9.0               # штраф за высоту: cost = 1 + K * (высота_над_морем)^2
WATER_COST = 55.0                   # штраф за брод через реку/узкий залив (не абсолютный барьер —
                                     # только очень невыгодный: если региону иначе не дотянуться,
                                     # он всё равно прорастёт, просто по самому короткому броду)

PALETTE = [
    (230, 57, 70), (69, 123, 157), (233, 196, 38), (42, 157, 143),
    (247, 127, 0), (144, 12, 63), (87, 117, 144), (188, 108, 37),
    (106, 153, 78), (157, 78, 221), (255, 183, 3), (58, 134, 47),
    (214, 40, 40), (29, 116, 217), (216, 148, 0), (111, 66, 193),
]


def load_heightmap():
    cell_count = WORLD_W * WORLD_H
    elev = np.fromfile(HEIGHTMAP_DIR / f"elevation-v{HEIGHTMAP_VERSION}.bin", dtype="<u2")
    forest = np.fromfile(HEIGHTMAP_DIR / "forest.bin", dtype=np.uint8)
    moisture = np.fromfile(HEIGHTMAP_DIR / "moisture.bin", dtype=np.uint8)
    assert elev.size == cell_count and forest.size == cell_count and moisture.size == cell_count, \
        "heightmap-файлы не совпадают по размеру с WORLD_W*WORLD_H — версия/формат разошлись"
    elev = elev.reshape(WORLD_H, WORLD_W).astype(np.float64)
    height = elev * (ELEV_SCALE / 65535.0)
    forest = forest.reshape(WORLD_H, WORLD_W).astype(np.float64) / 255.0
    moisture = moisture.reshape(WORLD_H, WORLD_W).astype(np.float64) / 255.0
    return height, forest, moisture


def render_base_terrain(height, forest):
    """Тот же общий вид, что в игре (низина/предгорья/камень/снег + лёгкий
    зелёный тон по лесистости), только CPU-палитра для превью — не то, чем
    красится сама 3D-сцена (та берёт настоящие текстуры в шейдере)."""
    from scipy.ndimage import distance_transform_edt

    land = height >= SEA
    t_land = np.clip((height - SEA) / (height.max() - SEA + 1e-9), 0, 1)

    def lerp(a, b, t):
        return a + (b - a) * t[..., None]

    stops = [0.0, 0.35, 0.70, 1.0]
    cols = [np.array([120, 148, 74]), np.array([96, 120, 58]),
            np.array([150, 138, 116]), np.array([235, 235, 238])]
    rgb = np.zeros((WORLD_H, WORLD_W, 3))
    for i in range(3):
        seg = np.clip((t_land - stops[i]) / (stops[i + 1] - stops[i]), 0, 1)
        mask = (t_land >= stops[i]) & (t_land <= stops[i + 1])
        rgb[mask] = lerp(cols[i], cols[i + 1], seg)[mask]

    forest_tint = np.array([40, 70, 30])
    rgb = rgb * (1 - 0.35 * forest[..., None]) + forest_tint * (0.35 * forest[..., None])

    dist_to_land = distance_transform_edt(~land)
    sea_t = np.clip(dist_to_land / 60.0, 0, 1)
    sea_rgb = lerp(np.array([86, 140, 168]), np.array([28, 58, 92]), sea_t)
    rgb = np.where(land[..., None], rgb, sea_rgb)
    return rgb


def equal_area_seeds(land, rng):
    """Шаг 2 из шапки файла — стартовые зёрна, выровненные по ПЛОЩАДИ
    (Ллойд), без учёта рельефа. Используются как стартовые точки для
    cost-based растекания ниже — само по себе на карту не идёт, но полезно
    сохранить для сравнения "было / стало" (см. PLAN.md, пункт про то, что
    выравнивание по площади и by Total War-стоимости дают разные размеры
    регионов, и это осознанный выбор, не баг генератора)."""
    ys, xs = np.mgrid[0:WORLD_H, 0:WORLD_W]
    land_pts = np.stack([xs[land], ys[land]], axis=1).astype(np.float64)

    cols_n, rows_n = 4, 4  # 4x4 = 16, тот же аспект 2:1, что и у самой карты
    cell_w, cell_h = WORLD_W / cols_n, WORLD_H / rows_n
    seeds = []
    for ry in range(rows_n):
        for rx in range(cols_n):
            cx = (rx + 0.5) * cell_w + rng.uniform(-0.15, 0.15) * cell_w
            cy = (ry + 0.5) * cell_h + rng.uniform(-0.15, 0.15) * cell_h
            seeds.append([cx, cy])
    seeds = np.array(seeds, dtype=np.float64)

    def snap_to_land(pt):
        px, py = int(round(pt[0])), int(round(pt[1]))
        px, py = min(max(px, 0), WORLD_W - 1), min(max(py, 0), WORLD_H - 1)
        if land[py, px]:
            return pt
        d = np.sum((land_pts - pt) ** 2, axis=1)
        return land_pts[np.argmin(d)].copy()

    seeds = np.array([snap_to_land(s) for s in seeds])
    sparse = land_pts[::3]  # прореживание — Ллойд не нужен на каждый пиксель
    for _ in range(LLOYD_ITERS):
        tree = cKDTree(seeds)
        _, assign = tree.query(sparse)
        new_seeds = seeds.copy()
        for i in range(N_REGIONS):
            pts = sparse[assign == i]
            if len(pts) > 0:
                new_seeds[i] = pts.mean(axis=0)
        seeds = np.array([snap_to_land(s) for s in new_seeds])
    return seeds


def equal_area_region_map(land, seeds):
    ys, xs = np.mgrid[0:WORLD_H, 0:WORLD_W]
    land_pts = np.stack([xs[land], ys[land]], axis=1).astype(np.float64)
    tree = cKDTree(seeds)
    _, region_of_land = tree.query(land_pts)
    region_map = np.full((WORLD_H, WORLD_W), -1, dtype=np.int32)
    region_map[land] = region_of_land
    return region_map


def total_war_region_map(height, land, seeds):
    """Шаг 3 из шапки файла — то, что реально просил автор: границы по
    стоимости прохода, не по прямой площади."""
    Hs, Ws = WORLD_H // DOWNSAMPLE, WORLD_W // DOWNSAMPLE
    # блочный даунсемпл: клетка "суша" только если ВСЕ под-пиксели суша —
    # тонкие речные русла (см. bake-пайплайн рельефа, D8 flow accumulation)
    # остаются барьером на грубой сетке, а не растворяются в округлении.
    land_s = land.reshape(Hs, DOWNSAMPLE, Ws, DOWNSAMPLE).all(axis=(1, 3))
    height_s = height.reshape(Hs, DOWNSAMPLE, Ws, DOWNSAMPLE).mean(axis=(1, 3))

    t = np.clip((height_s - SEA) / (height_s.max() - SEA + 1e-9), 0, 1)
    cost = 1.0 + MOUNTAIN_COST_K * (t ** 2)
    cost = np.where(land_s, cost, WATER_COST).astype(np.float64)

    seeds_s = np.array([[int(round(y / DOWNSAMPLE)), int(round(x / DOWNSAMPLE))] for x, y in seeds])
    seeds_s[:, 0] = np.clip(seeds_s[:, 0], 0, Hs - 1)
    seeds_s[:, 1] = np.clip(seeds_s[:, 1], 0, Ws - 1)

    t0 = time.time()
    cost_fields = np.zeros((N_REGIONS, Hs, Ws), dtype=np.float64)
    for i in range(N_REGIONS):
        mcp = MCP_Geometric(cost, fully_connected=True)
        costs, _ = mcp.find_costs([tuple(seeds_s[i])])
        cost_fields[i] = costs
    print(f"  MCP Дейкстра по {N_REGIONS} зёрнам: {time.time() - t0:.1f}с")

    region_s = np.argmin(cost_fields, axis=0).astype(np.int32)
    region_s[~land_s] = -1
    region_map = np.repeat(np.repeat(region_s, DOWNSAMPLE, axis=0), DOWNSAMPLE, axis=1)[:WORLD_H, :WORLD_W]
    region_map[~land] = -1
    return region_map


def render_regions(base_rgb, region_map, caption):
    overlay = base_rgb.copy()
    alpha = 0.32
    region_rgb = np.zeros((WORLD_H, WORLD_W, 3))
    for i in range(N_REGIONS):
        region_rgb[region_map == i] = PALETTE[i]
    land_mask = region_map >= 0
    overlay[land_mask] = base_rgb[land_mask] * (1 - alpha) + region_rgb[land_mask] * alpha

    rm = region_map
    border = np.zeros((WORLD_H, WORLD_W), dtype=bool)
    diff_h = (rm[:, :-1] != rm[:, 1:]) & (rm[:, :-1] >= 0) & (rm[:, 1:] >= 0)
    diff_v = (rm[:-1, :] != rm[1:, :]) & (rm[:-1, :] >= 0) & (rm[1:, :] >= 0)
    border[:, :-1] |= diff_h
    border[:, 1:] |= diff_h
    border[:-1, :] |= diff_v
    border[1:, :] |= diff_v

    img = Image.fromarray(np.clip(overlay, 0, 255).astype(np.uint8), "RGB")
    border_img = Image.fromarray((border * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    arr = np.array(img)
    arr[np.array(border_img) > 0] = (28, 22, 18)
    img = Image.fromarray(arr, "RGB")

    draw = ImageDraw.Draw(img, "RGBA")
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)

    for i in range(N_REGIONS):
        ys, xs = np.where(region_map == i)
        if len(xs) == 0:
            continue
        cx, cy = xs.mean(), ys.mean()
        r = 26
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 235), outline=(20, 20, 20, 255), width=3)
        txt = str(i + 1)
        bbox = draw.textbbox((0, 0), txt, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - 2), txt, font=font, fill=(20, 20, 20, 255))

    draw.rectangle([0, 0, WORLD_W - 1, WORLD_H - 1], outline=(15, 15, 15, 255), width=3)
    bbox = draw.textbbox((0, 0), caption, font=font_small)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 10
    draw.rectangle([10, WORLD_H - th - 2 * pad - 10, 10 + tw + 2 * pad, WORLD_H - 10], fill=(10, 10, 10, 180))
    draw.text((10 + pad, WORLD_H - th - pad - 10 - bbox[1]), caption, font=font_small, fill=(255, 255, 255, 255))
    return img


def main():
    print("Читаю heightmap...")
    height, forest, moisture = load_heightmap()
    land = height >= SEA

    print("Рисую базовый рельеф...")
    base_rgb = render_base_terrain(height, forest)

    print(f"Раскидываю {N_REGIONS} зёрен, выравниваю по площади (Ллойд)...")
    rng = np.random.default_rng(SEED)
    seeds = equal_area_seeds(land, rng)
    region_equal = equal_area_region_map(land, seeds)

    print("Считаю границы по стоимости прохода (Total War)...")
    region_tw = total_war_region_map(height, land, seeds)

    print("Рендерю превью...")
    img_equal = render_regions(
        base_rgb, region_equal,
        f"Мир {WORLD_W}×{WORLD_H} юнитов · {N_REGIONS} регионов, равные по площади (без учёта рельефа)")
    img_equal.save(OUT_DIR / "preview_equal_area.png")

    img_tw = render_regions(
        base_rgb, region_tw,
        f"{N_REGIONS} регионов, границы по стоимости прохода — режутся реками и горными грядами")
    img_tw.save(OUT_DIR / "preview_total_war.png")

    # "Запечённые" данные — тем же типом, что и heightmap/*.bin (см. шапку
    # файла): uint8 на клетку, 0..N_REGIONS-1 = регион, 255 = вода/вне
    # региона. Пока НИКЕМ не читается в движке/сервере — это будущий
    # артефакт, когда механика альянсов дойдёт до реализации (см. PLAN.md).
    baked = np.where(region_tw >= 0, region_tw, 255).astype(np.uint8)
    baked.tofile(OUT_DIR / "regions-v1.bin")

    meta = {
        "version": 1,
        "world_w": WORLD_W, "world_h": WORLD_H,
        "n_regions": N_REGIONS,
        "generation": {
            "seed": SEED, "lloyd_iters": LLOYD_ITERS, "downsample": DOWNSAMPLE,
            "mountain_cost_k": MOUNTAIN_COST_K, "water_cost": WATER_COST,
        },
        "regions": [],
    }
    for i in range(N_REGIONS):
        ys, xs = np.where(region_tw == i)
        cells = int(len(xs))
        cx_px, cy_px = (float(xs.mean()), float(ys.mean())) if cells else (None, None)
        meta["regions"].append({
            "id": i + 1,
            "cells": cells,
            "centroid_world": [cx_px - WORLD_W / 2, cy_px - WORLD_H / 2] if cells else None,
            "seed_world": [float(seeds[i][0] - WORLD_W / 2), float(seeds[i][1] - WORLD_H / 2)],
        })
    (OUT_DIR / "regions_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Готово:")
    print(" ", OUT_DIR / "preview_equal_area.png")
    print(" ", OUT_DIR / "preview_total_war.png")
    print(" ", OUT_DIR / "regions-v1.bin")
    print(" ", OUT_DIR / "regions_meta.json")


if __name__ == "__main__":
    main()
