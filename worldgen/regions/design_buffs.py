#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Черновой набор региональных баффов поверх уже сгенерированных 16 регионов
(generate_regions.py, см. её же PLAN.md) — офлайн-анализ, тоже вне движка.

Идея автора: тип баффа — от рельефа региона (степь -> конница, горы/руда ->
защита и т.д., см. TROOP_TYPES/bonuses() в index.html), а СИЛА баффа — от
того, насколько регион "трудный и центральный": чем больше у региона
соседей (степеней в графе смежности регионов) и чем изрезаннее его
рельеф, тем он ценнее — и тем труднее его удержать (больше границ = больше
соседей, которые могут его оспорить), так что более сильный бафф — честная
компенсация за более высокий риск потери.

Считает:
  1. Граф смежности регионов (кто с кем граничит) -> число соседей.
  2. Профиль местности региона (высота/лес/влажность/изрезанность/выход к
     морю) -> ведущий архетип (горный/рудный/лесной/степной/речной/
     приморский) -> тип баффа (привязан к РЕАЛЬНЫМ полям bonuses() в
     index.html — atkCav/defInf/prodFood и т.д., не выдуманным именам).
  3. Тир (I/II/III) из объединённого "веса" региона (соседи + изрезанность)
     -> сколько баффов и какой силы.

Зависимости — как у generate_regions.py: numpy, scipy (только для чтения
уже посчитанных данных, MCP/Dijkstra тут не нужен).
"""
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
HEIGHTMAP_DIR = REPO_ROOT / "heightmap"

WORLD_W, WORLD_H = 2400, 1200
ELEV_SCALE = 2.5
SEA = 0.235
N_REGIONS = 16

# ---- архетипы: (название, тип боевого баффа, тип экономического баффа) ----
# Поля — РЕАЛЬНЫЕ ключи bonuses() (index.html:4565) и TKEYS (:3340,
# inf/arc/cav/sie), ничего не выдумано.
ARCHETYPES = {
    "mountain": {
        "name": "Горный",
        "flavor": "Скальные твердыни и перевалы — тяжело штурмовать, тяжело и снабжать.",
        "combat": [("defInf", 1.0), ("defArc", 1.0), ("defCav", 1.0), ("defSie", 1.0)],
        "econ": [("wallBonus", 0.6)],
    },
    "ore": {
        "name": "Рудный",
        "flavor": "Голые предгорья и каменоломни — руда и камень, не поля.",
        "combat": [("defSie", 1.2)],
        "econ": [("prodStone", 1.0), ("prodGold", 0.7), ("buildCostCut", 0.5)],
    },
    "forest": {
        "name": "Лесной",
        "flavor": "Глухие чащи — лук из тиса, засады, разведка.",
        "combat": [("atkArc", 1.2)],
        "econ": [("scoutBonus", 1.0), ("prodWood", 0.8)],
    },
    "steppe": {
        "name": "Степной",
        "flavor": "Открытые равнины — раздолье для конных лав.",
        "combat": [("atkCav", 1.3)],
        "econ": [("march", 0.5)],
    },
    "river": {
        "name": "Плодородный",
        "flavor": "Речные долины и наносные почвы — житница региона.",
        "combat": [("hp", 0.8)],
        "econ": [("prodFood", 1.0), ("gather", 0.8), ("trainSpeed", 0.5)],
    },
    "coastal": {
        "name": "Приморский",
        "flavor": "Выход к морю — торговые пути и новости раньше других.",
        "combat": [("firstStrike", 0.8)],
        "econ": [("prodGold", 1.0), ("load", 0.8), ("researchSpeed", 0.6)],
    },
}

TIER_MAGNITUDE = {1: 0.03, 2: 0.045, 3: 0.06}   # базовая сила ОДНОГО баффа по тиру
TIER_SLOTS = {1: 1, 2: 2, 3: 3}                 # сколько баффов получает регион на этом тире


def load_heightmap():
    cell_count = WORLD_W * WORLD_H
    elev = np.fromfile(HEIGHTMAP_DIR / "elevation-v6.bin", dtype="<u2").reshape(WORLD_H, WORLD_W).astype(np.float64)
    height = elev * (ELEV_SCALE / 65535.0)
    forest = np.fromfile(HEIGHTMAP_DIR / "forest.bin", dtype=np.uint8).reshape(WORLD_H, WORLD_W).astype(np.float64) / 255.0
    moisture = np.fromfile(HEIGHTMAP_DIR / "moisture.bin", dtype=np.uint8).reshape(WORLD_H, WORLD_W).astype(np.float64) / 255.0
    return height, forest, moisture


def region_adjacency(region_map):
    """Кто с кем граничит — по 4-связности между разными region_id (вода не считается)."""
    pairs = set()
    rm = region_map
    h_a, h_b = rm[:, :-1], rm[:, 1:]
    mask = (h_a != h_b) & (h_a >= 0) & (h_b >= 0)
    for a, b in zip(h_a[mask], h_b[mask]):
        pairs.add((min(int(a), int(b)), max(int(a), int(b))))
    v_a, v_b = rm[:-1, :], rm[1:, :]
    mask = (v_a != v_b) & (v_a >= 0) & (v_b >= 0)
    for a, b in zip(v_a[mask], v_b[mask]):
        pairs.add((min(int(a), int(b)), max(int(a), int(b))))
    neighbors = {i: set() for i in range(N_REGIONS)}
    for a, b in pairs:
        neighbors[a].add(b)
        neighbors[b].add(a)
    return neighbors


def ocean_mask(height):
    """Отличаем настоящее море от узких речных русел, прорезанных внутрь
    суши (см. terrain.ts, D8 flow accumulation) — оба типа физически одна
    и та же "не суша" (height < SEA), и часто один связный компонент (реки
    впадают в море, граф смежности их честно соединяет), так что просто
    "взять крупнейший компонент" НЕ работает — река, дотянувшаяся до края
    карты, утянула бы за собой всё быть "морем" до самого истока.
    Правильный критерий — не связность, а ШИРИНА: открытое море в этом
    запеке — сплошная широкая полоса вдоль края мира (десятки клеток),
    русло реки — нить в 1-3 клетки. Эрозия на 6 клеток убивает любую реку,
    оставляя только действительно широкую воду; растим обратно дилатацией
    на ту же величину, чтобы вернуть настоящую береговую линию."""
    water = height < SEA
    core = ndimage.binary_erosion(water, iterations=6)
    ocean = ndimage.binary_dilation(core, iterations=6) & water
    return ocean


COAST_BAND = 30  # мировых юнитов — насколько вглубь суши ещё считается "прибрежным поясом"


def region_raw_stats(region_map, height, forest, moisture, coast_dist, i):
    mask = region_map == i
    h, f, m = height[mask], forest[mask], moisture[mask]
    t = np.clip((h - SEA) / (height.max() - SEA + 1e-9), 0, 1)

    gy, gx = np.gradient(height)
    rugged_full = np.hypot(gx, gy)
    rugged_p95 = np.percentile(rugged_full[height >= SEA], 95) + 1e-9
    rugged = np.clip(rugged_full[mask] / rugged_p95, 0, 1)

    # Доля клетки региона, попадающая в прибрежный пояс — НЕ булево "хоть
    # где-то коснулся моря" (у региона размером в сотни клеток край в 1-2
    # клетки моря ничего не говорит о его характере), а именно доля площади:
    # у настоящего приморского региона побережье — заметная часть его самого,
    # а не случайный уголок.
    coastal_frac = float((coast_dist[mask] < COAST_BAND).mean())

    return {
        "mean_elev_pct": float(t.mean()),
        "forest_pct": float(f.mean()),
        "moisture_pct": float(m.mean()),
        "rugged_mean": float(rugged.mean()),
        "coastal_frac": coastal_frac,
    }


def rank01(values):
    """Ранг 0..1 СРЕДИ ЭТИХ ЖЕ 16 РЕГИОНОВ, не абсолютная величина. На этой
    конкретной карте влажность/лес высоки почти everywhere (плато + арка
    Карпат, не пустыня с редкими оазисами) — архетип "по абсолютному порогу"
    почти у всех вываливался в один и тот же ("Плодородный"): 0.62 влажности
    выглядит "высокой" только если где-то на карте вообще бывает 0.2, а не
    потому что это правда самый влажный регион. Ранг решает это раз и
    навсегда: архетип определяет, кто круче остальных 15 ПО ЭТОЙ карте,
    а не кто перевалил произвольный порог."""
    order = np.argsort(np.argsort(values))
    n = len(values)
    return order / max(1, n - 1)


def classify_regions(raw_stats):
    """Возвращает {region_id: (archetype, stats-с-рангами-и-очками)} —
    вызывается один раз на ВСЕ регионы сразу (см. rank01)."""
    elev = rank01(np.array([s["mean_elev_pct"] for s in raw_stats]))
    forest_r = rank01(np.array([s["forest_pct"] for s in raw_stats]))
    moist = rank01(np.array([s["moisture_pct"] for s in raw_stats]))
    rugged = rank01(np.array([s["rugged_mean"] for s in raw_stats]))
    coastal = rank01(np.array([s["coastal_frac"] for s in raw_stats]))

    out = []
    for i, s in enumerate(raw_stats):
        ranks = {"elev": elev[i], "forest": forest_r[i], "moisture": moist[i],
                  "rugged": rugged[i], "coastal": coastal[i]}
        scores = {
            "mountain": 0.55 * ranks["rugged"] + 0.45 * ranks["elev"],
            "ore": 0.55 * ranks["rugged"] + 0.45 * (1 - ranks["moisture"]),
            "forest": ranks["forest"],
            "steppe": 0.45 * (1 - ranks["forest"]) + 0.35 * (1 - ranks["moisture"]) + 0.20 * (1 - ranks["rugged"]),
            "river": 0.6 * ranks["moisture"] + 0.4 * (1 - ranks["elev"]),
            "coastal": ranks["coastal"] if s["coastal_frac"] > 0.15 else 0.0,  # реальный физический порог —
            # ранг сам по себе не отличит "слегка на отшибе от моря" от
            # "правда стоит на берегу", у ранга нет абсолютной единицы
        }
        arche = max(scores, key=scores.get)
        out.append((arche, {**s, "ranks": {k: round(v, 2) for k, v in ranks.items()},
                             "scores": {k: round(v, 2) for k, v in scores.items()}}))
    return out


def main():
    region_map = np.fromfile(SCRIPT_DIR / "regions-v1.bin", dtype=np.uint8).reshape(WORLD_H, WORLD_W).astype(np.int32)
    region_map[region_map == 255] = -1
    meta = json.loads((SCRIPT_DIR / "regions_meta.json").read_text(encoding="utf-8"))

    height, forest, moisture = load_heightmap()
    ocean = ocean_mask(height)
    coast_dist = ndimage.distance_transform_edt(~ocean)  # 0 в море, растёт вглубь суши
    neighbors = region_adjacency(region_map)

    raw_stats = [region_raw_stats(region_map, height, forest, moisture, coast_dist, i) for i in range(N_REGIONS)]
    classified = classify_regions(raw_stats)

    rows = []
    for i in range(N_REGIONS):
        arche, stats = classified[i]
        deg = len(neighbors[i])
        rows.append({"id": i, "archetype": arche, "stats": stats, "degree": deg})

    # "вес" региона — соседи (степень в графе смежности) + изрезанность,
    # оба 0..1 нормированы по всем 16 регионам, соседи чуть весомее (0.6)
    # — как и просил автор, центральность/спорность решает больше, чем
    # просто сложный рельеф сам по себе.
    degs = np.array([r["degree"] for r in rows], dtype=np.float64)
    ruggeds = np.array([r["stats"]["rugged_mean"] for r in rows], dtype=np.float64)
    deg_n = (degs - degs.min()) / (degs.max() - degs.min() + 1e-9)
    rug_n = (ruggeds - ruggeds.min()) / (ruggeds.max() - ruggeds.min() + 1e-9)
    value = 0.6 * deg_n + 0.4 * rug_n
    for r, v in zip(rows, value):
        r["value"] = float(v)

    # терцили -> тир I/II/III
    order = sorted(rows, key=lambda r: r["value"])
    for rank, r in enumerate(order):
        r["tier"] = 1 if rank < 5 else (2 if rank < 11 else 3)   # 5/6/5 регионов по тирам

    out_rows = []
    for r in sorted(rows, key=lambda r: r["id"]):
        arche = ARCHETYPES[r["archetype"]]
        tier = r["tier"]
        mag = TIER_MAGNITUDE[tier]
        slots = TIER_SLOTS[tier]
        pool = arche["combat"] + arche["econ"]
        pool = sorted(pool, key=lambda kv: -kv[1])[:slots]
        buffs = [{"field": f, "pct": round(mag * w * 100, 1)} for f, w in pool]
        out_rows.append({
            "id": r["id"] + 1,
            "archetype": arche["name"],
            "archetype_key": r["archetype"],
            "flavor": arche["flavor"],
            "neighbors": sorted(n + 1 for n in neighbors[r["id"]]),
            "degree": r["degree"],
            "rugged_mean": round(r["stats"]["rugged_mean"], 2),
            "coastal": r["stats"]["coastal_frac"] > 0.15,
            "value_score": round(r["value"], 2),
            "tier": tier,
            "buffs": buffs,
        })

    (SCRIPT_DIR / "regions_buffs.json").write_text(
        json.dumps({"regions": out_rows}, ensure_ascii=False, indent=2), encoding="utf-8")

    tier_name = {1: "I  (окраина)", 2: "II (спорный)", 3: "III (стержневой)"}
    print(f"{'#':>3} {'Тир':<18} {'Соседей':>7} {'Архетип':<12} {'Баффы'}")
    for r in sorted(out_rows, key=lambda r: (-r["tier"], -r["degree"])):
        buffs_txt = ", ".join(f"{b['field']} +{b['pct']}%" for b in r["buffs"])
        print(f"{r['id']:>3} {tier_name[r['tier']]:<18} {r['degree']:>7} {r['archetype']:<12} {buffs_txt}")

    write_buffs_md(out_rows, tier_name)


def write_buffs_md(out_rows, tier_name):
    lines = [
        "# Баффы регионов — черновик",
        "",
        "Сгенерировано `design_buffs.py` поверх `regions-v1.bin`/`regions_meta.json`",
        "(см. `generate_regions.py`). Тип баффа — от преобладающего рельефа региона",
        "(по РАНГУ среди этих же 16 регионов, не по абсолютному порогу — см. комментарий",
        "у `rank01()` в скрипте). Сила и число баффов — от тира: тир считается из веса",
        "региона = 0.6×(число соседей) + 0.4×(изрезанность рельефа), оба нормированы",
        "0..1 по всем 16 регионам. Больше соседей и труднее рельеф — выше тир, больше",
        "баффов, но и больше желающих отобрать регион (больше границ = больше",
        "потенциальных атак).",
        "",
        "Поля баффов — РЕАЛЬНЫЕ ключи `bonuses()` (`index.html:4565`) и типов войск",
        "`TKEYS = [\"inf\",\"arc\",\"cav\",\"sie\"]` (`index.html:3340`), не выдуманные названия —",
        "готовы к тому, чтобы лечь прямо в `bonuses()` отдельным слагаемым, когда дойдёт",
        "до реализации (см. PLAN.md, пункт 5).",
        "",
        "| # | Тир | Соседей | Архетип | Баффы | Особенность |",
        "|---|-----|---------|---------|-------|-------------|",
    ]
    for r in sorted(out_rows, key=lambda r: r["id"]):
        buffs_txt = "; ".join(f"`{b['field']}` +{b['pct']}%" for b in r["buffs"])
        note = "приморский" if r["coastal"] else ""
        lines.append(f"| {r['id']} | {tier_name[r['tier']]} | {r['degree']} | {r['archetype']} | {buffs_txt} | {note} |")
    lines += ["", "## По архетипам", ""]
    for key, a in ARCHETYPES.items():
        lines.append(f"**{a['name']}** — {a['flavor']}")
        lines.append("")
    (SCRIPT_DIR / "regions_buffs.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
