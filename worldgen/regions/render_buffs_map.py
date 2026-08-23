#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Превью баффов поверх карты регионов — берёт уже посчитанные
regions-v1.bin/regions_buffs.json (design_buffs.py) и base_terrain, красит
регион по АРХЕТИПУ (а не порядковому номеру, как в generate_regions.py —
там цвет был просто "чтобы отличались"), подписывает тир и архетип."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
WORLD_W, WORLD_H = 2400, 1200
N_REGIONS = 16

ARCHETYPE_COLOR = {
    "mountain": (120, 108, 128),
    "ore": (150, 92, 40),
    "forest": (32, 92, 28),
    "steppe": (230, 196, 40),
    "river": (40, 158, 118),
    "coastal": (40, 120, 196),
}
TIER_RING = {1: (150, 150, 150), 2: (235, 196, 60), 3: (214, 40, 40)}
TIER_LABEL = {1: "I", 2: "II", 3: "III"}

region_map = np.fromfile(SCRIPT_DIR / "regions-v1.bin", dtype=np.uint8).reshape(WORLD_H, WORLD_W).astype(np.int32)
region_map[region_map == 255] = -1
buffs = {r["id"] - 1: r for r in json.loads((SCRIPT_DIR / "regions_buffs.json").read_text(encoding="utf-8"))["regions"]}
meta = {r["id"] - 1: r for r in json.loads((SCRIPT_DIR / "regions_meta.json").read_text(encoding="utf-8"))["regions"]}

base = np.array(Image.open(SCRIPT_DIR / "preview_total_war.png").convert("RGB"), dtype=np.float64)
# preview_total_war.png уже содержит заливку/подписи предыдущего рендера —
# берём чистый рельеф заново тем же способом, что и generate_regions.py,
# чтобы не красить архетип поверх старой заливки по номеру.
import sys
sys.path.insert(0, str(SCRIPT_DIR))
from generate_regions import load_heightmap, render_base_terrain  # noqa: E402

height, forest, moisture = load_heightmap()
base_rgb = render_base_terrain(height, forest)

overlay = base_rgb.copy()
alpha = 0.5
region_rgb = np.zeros((WORLD_H, WORLD_W, 3))
for i in range(N_REGIONS):
    color = ARCHETYPE_COLOR[buffs[i]["archetype_key"]]
    region_rgb[region_map == i] = color
land_mask = region_map >= 0
overlay[land_mask] = base_rgb[land_mask] * (1 - alpha) + region_rgb[land_mask] * alpha

rm = region_map
border = np.zeros((WORLD_H, WORLD_W), dtype=bool)
diff_h = (rm[:, :-1] != rm[:, 1:]) & (rm[:, :-1] >= 0) & (rm[:, 1:] >= 0)
diff_v = (rm[:-1, :] != rm[1:, :]) & (rm[:-1, :] >= 0) & (rm[1:, :] >= 0)
border[:, :-1] |= diff_h; border[:, 1:] |= diff_h
border[:-1, :] |= diff_v; border[1:, :] |= diff_v

img = Image.fromarray(np.clip(overlay, 0, 255).astype(np.uint8), "RGB")
border_img = Image.fromarray((border * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
arr = np.array(img)
arr[np.array(border_img) > 0] = (28, 22, 18)
img = Image.fromarray(arr, "RGB")

draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
font_tiny = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)

for i in range(N_REGIONS):
    cap = meta[i]["capital_world"]
    cx, cy = cap[0] + WORLD_W / 2, cap[1] + WORLD_H / 2
    tier = buffs[i]["tier"]
    r = 34
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 235), outline=TIER_RING[tier], width=5)
    txt = str(i + 1)
    bbox = draw.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw / 2 - bbox[0], cy - r - th - 4), txt, font=font, fill=(20, 20, 20, 255),
              stroke_width=3, stroke_fill=(255, 255, 255, 220))
    tt = TIER_LABEL[tier]
    bbox2 = draw.textbbox((0, 0), tt, font=font_tiny)
    tw2, th2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    draw.text((cx - tw2 / 2 - bbox2[0], cy - th2 / 2 - bbox2[1] - 2), tt, font=font_tiny, fill=(20, 20, 20, 255))

# легенда
lg_x, lg_y = WORLD_W - 330, 14
draw.rectangle([lg_x - 10, lg_y - 10, WORLD_W - 14, lg_y + 22 * (len(ARCHETYPE_COLOR) + 1) + 10],
               fill=(10, 10, 10, 175))
draw.text((lg_x, lg_y), "Архетип региона", font=font_small, fill=(255, 255, 255, 255))
names = {"mountain": "Горный", "ore": "Рудный", "forest": "Лесной",
         "steppe": "Степной", "river": "Плодородный", "coastal": "Приморский"}
for j, (k, c) in enumerate(ARCHETYPE_COLOR.items()):
    y = lg_y + 22 * (j + 1)
    draw.rectangle([lg_x, y + 2, lg_x + 16, y + 16], fill=c + (255,))
    draw.text((lg_x + 24, y), names[k], font=font_small, fill=(255, 255, 255, 255))

lg2_x, lg2_y = 14, 14
draw.rectangle([lg2_x - 10, lg2_y - 10, lg2_x + 250, lg2_y + 22 * 4 + 6], fill=(10, 10, 10, 175))
draw.text((lg2_x, lg2_y), "Тир (обводка кружка)", font=font_small, fill=(255, 255, 255, 255))
tier_txt = {1: "I — окраина, 1 бафф", 2: "II — спорный, 2 баффа", 3: "III — стержневой, 3 баффа"}
for j, (t, c) in enumerate(TIER_RING.items()):
    y = lg2_y + 22 * (j + 1)
    draw.ellipse([lg2_x, y + 2, lg2_x + 14, y + 16], outline=c, width=4)
    draw.text((lg2_x + 24, y), tier_txt[t], font=font_small, fill=(255, 255, 255, 255))

draw.rectangle([0, 0, WORLD_W - 1, WORLD_H - 1], outline=(15, 15, 15, 255), width=3)
img.save(SCRIPT_DIR / "preview_buffs.png")
print("saved preview_buffs.png")
