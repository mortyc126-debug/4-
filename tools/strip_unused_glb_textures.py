#!/usr/bin/env python3
"""
Убирает из .glb-моделей текстуры, которые движок игры никогда не читает.

Зачем. engine/src/glb.ts (loadGLB) берёт из модели ровно одну картинку —
базовый цвет:

    const bcIdx = mat.pbrMetallicRoughness.baseColorTexture.index;

Шейдер модели (engine/src/modelRenderer.ts, MODEL_SHADER) тоже объявляет
единственную текстуру — `tex`. А внутри самих .glb лежат ещё карта нормалей
и карта шероховатости/металличности, каждая 4096x4096: они скачиваются
браузером в составе файла и выбрасываются сразу после разбора. На типичном
замке это ~1.8МБ из 4.4МБ — около 40% веса, который игрок ждёт впустую при
первом заходе в мир.

Что делает скрипт. Оставляет геометрию и базовый цвет ровно как были
(побайтово), выкидывает неиспользуемые картинки вместе с их кусками
двоичного блока, чистит ссылки на них в материалах и пересобирает файл.
Результат остаётся валидным glTF: модель по-прежнему открывается в любом
редакторе, просто без PBR-карт, которых игра и так не применяла. Исходники
со всеми картами остаются в истории git.

Запуск:
    python3 tools/strip_unused_glb_textures.py --check    # только показать, что будет
    python3 tools/strip_unused_glb_textures.py            # переписать модели
"""
import json
import struct
import sys
import glob
import os

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    with open(path, "rb") as fh:
        magic, version, total = struct.unpack("<III", fh.read(12))
        if magic != 0x46546C67:
            raise ValueError(f"{path}: не GLB-контейнер")
        js, binary = None, None
        while fh.tell() < total:
            head = fh.read(8)
            if len(head) < 8:
                break
            clen, ctype = struct.unpack("<II", head)
            data = fh.read(clen)
            if ctype == JSON_CHUNK:
                js = json.loads(data.decode("utf-8"))
            elif ctype == BIN_CHUNK:
                binary = data
        if js is None or binary is None:
            raise ValueError(f"{path}: нет JSON- или BIN-чанка")
        return js, binary


def pad4(b, filler=b"\x00"):
    return b + filler * ((4 - len(b) % 4) % 4)


def write_glb(path, js, binary):
    jchunk = pad4(json.dumps(js, separators=(",", ":")).encode("utf-8"), b" ")
    bchunk = pad4(binary)
    total = 12 + 8 + len(jchunk) + 8 + len(bchunk)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(jchunk), JSON_CHUNK))
        fh.write(jchunk)
        fh.write(struct.pack("<II", len(bchunk), BIN_CHUNK))
        fh.write(bchunk)


def base_color_images(js):
    """Картинки, которые реально нужны: базовый цвет каждого материала."""
    keep = set()
    for mat in js.get("materials", []):
        tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if tex is None:
            continue
        src = js["textures"][tex["index"]].get("source")
        if src is not None:
            keep.add(src)
    return keep


# Ссылки на текстуры, которых у движка нет ни в разборе, ни в шейдере.
UNUSED_MATERIAL_TEXTURE_KEYS = ("normalTexture", "occlusionTexture", "emissiveTexture")


def strip(js, binary):
    keep_images = base_color_images(js)
    images = js.get("images", [])
    drop_images = [i for i in range(len(images)) if i not in keep_images]
    if not drop_images:
        return None

    # 1. Материалы: убрать ссылки на карты, которые игра не читает.
    for mat in js.get("materials", []):
        for k in UNUSED_MATERIAL_TEXTURE_KEYS:
            mat.pop(k, None)
        pbr = mat.get("pbrMetallicRoughness")
        if pbr:
            pbr.pop("metallicRoughnessTexture", None)

    # 2. Текстуры: оставить только те, чья картинка сохраняется.
    old_textures = js.get("textures", [])
    tex_map, new_textures = {}, []
    for i, t in enumerate(old_textures):
        if t.get("source") in keep_images:
            tex_map[i] = len(new_textures)
            new_textures.append(t)
    for mat in js.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        bc = pbr.get("baseColorTexture")
        if bc is not None:
            bc["index"] = tex_map[bc["index"]]
    js["textures"] = new_textures

    # 3. Картинки: оставить только базовый цвет.
    img_map, new_images = {}, []
    for i, im in enumerate(images):
        if i in keep_images:
            img_map[i] = len(new_images)
            new_images.append(im)
    for t in js["textures"]:
        if "source" in t:
            t["source"] = img_map[t["source"]]
    js["images"] = new_images

    # 4. Пересобрать двоичный блок из тех кусков, на которые ещё есть ссылки.
    referenced = set()
    for a in js.get("accessors", []):
        if a.get("bufferView") is not None:
            referenced.add(a["bufferView"])
        sp = a.get("sparse")
        if sp:
            for part in ("indices", "values"):
                if part in sp and sp[part].get("bufferView") is not None:
                    referenced.add(sp[part]["bufferView"])
    for im in js["images"]:
        if im.get("bufferView") is not None:
            referenced.add(im["bufferView"])

    old_views = js.get("bufferViews", [])
    view_map, new_views, blob = {}, [], bytearray()
    for i, v in enumerate(old_views):
        if i not in referenced:
            continue
        off, ln = v.get("byteOffset", 0), v["byteLength"]
        # Выравнивание на 4 байта: accessor'ы читаются типизированными
        # массивами, а те требуют кратного смещения.
        while len(blob) % 4:
            blob.append(0)
        nv = dict(v)
        nv["byteOffset"] = len(blob)
        blob += binary[off:off + ln]
        view_map[i] = len(new_views)
        new_views.append(nv)

    for a in js.get("accessors", []):
        if a.get("bufferView") is not None:
            a["bufferView"] = view_map[a["bufferView"]]
        sp = a.get("sparse")
        if sp:
            for part in ("indices", "values"):
                if part in sp and sp[part].get("bufferView") is not None:
                    sp[part]["bufferView"] = view_map[sp[part]["bufferView"]]
    for im in js["images"]:
        if im.get("bufferView") is not None:
            im["bufferView"] = view_map[im["bufferView"]]
    for s in js.get("samplers", []):
        pass  # сэмплеры общие и невелики — не трогаем

    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(blob)}]
    return js, bytes(blob), [images[i].get("name", f"#{i}") for i in drop_images]


# --- проверка: то, что читает движок, должно остаться байт в байт ---
CTYPE = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def engine_view(js, binary):
    """Ровно то, что достаёт loadGLB() из engine/src/glb.ts."""
    def acc_bytes(i):
        a = js["accessors"][i]
        v = js["bufferViews"][a["bufferView"]]
        _, size = CTYPE[a["componentType"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        ln = a["count"] * NCOMP[a["type"]] * size
        return binary[off:off + ln]

    prim = js["meshes"][0]["primitives"][0]
    out = {
        "positions": acc_bytes(prim["attributes"]["POSITION"]),
        "normals": acc_bytes(prim["attributes"]["NORMAL"]),
        "uvs": acc_bytes(prim["attributes"]["TEXCOORD_0"]),
        "indices": acc_bytes(prim["indices"]),
    }
    mat = js["materials"][prim["material"]]
    bc = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    img = js["images"][js["textures"][bc]["source"]]
    v = js["bufferViews"][img["bufferView"]]
    off = v.get("byteOffset", 0)
    out["image"] = binary[off:off + v["byteLength"]]
    out["mime"] = img.get("mimeType")
    return out


# Папки, которые скрипт НЕ трогает.
#
# models/generals — не игровые модели, а ИСХОДНИКИ: автор выгружает их из
# редактора как есть (~17 МБ, полмиллиона треугольников, три 2K-карты), а в
# игру идут их упрощённые копии в models/marches, которые печёт
# tools/decimate_glb.mjs. Браузер исходники не качает никогда, так что
# выигрыша от чистки нет вовсе, — а карта нормалей и шероховатости пропала бы
# из того самого файла, из которого модель перепекают. Один запуск скрипта
# «на всякий случай» молча съедал 24 МБ авторских исходных данных.
SKIP_DIRS = ("generals",)


def main():
    check_only = "--check" in sys.argv
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = sorted(
        p for p in glob.glob(os.path.join(root, "models", "*", "*.glb"))
        if os.path.basename(os.path.dirname(p)) not in SKIP_DIRS
    )
    if not files:
        print("моделей не найдено")
        return 1
    total_before = total_after = 0
    changed = 0
    for path in files:
        before = os.path.getsize(path)
        js, binary = read_glb(path)
        original = engine_view(js, binary)
        result = strip(json.loads(json.dumps(js)), binary)
        rel = os.path.relpath(path, root)
        if result is None:
            print(f"  {rel}: лишних текстур нет, пропуск")
            total_before += before
            total_after += before
            continue
        new_js, new_bin, dropped = result
        # то, что читает движок, обязано совпасть байт в байт
        check = engine_view(new_js, new_bin)
        for k in ("positions", "normals", "uvs", "indices", "image", "mime"):
            if check[k] != original[k]:
                print(f"  {rel}: ПРОВЕРКА НЕ ПРОШЛА по полю {k} — файл не тронут")
                return 1
        if check_only:
            after = 12 + 8 + len(pad4(json.dumps(new_js, separators=(',', ':')).encode())) + 8 + len(pad4(new_bin))
        else:
            write_glb(path, new_js, new_bin)
            after = os.path.getsize(path)
            # перечитать с диска и проверить ещё раз, уже настоящий файл
            js2, bin2 = read_glb(path)
            check2 = engine_view(js2, bin2)
            for k in ("positions", "normals", "uvs", "indices", "image", "mime"):
                assert check2[k] == original[k], f"{rel}: расхождение после записи ({k})"
        changed += 1
        total_before += before
        total_after += after
        print(f"  {rel}: {before/1048576:5.2f} -> {after/1048576:5.2f} МБ  "
              f"(убрано: {', '.join(dropped)})")
    print()
    print(f"{'БЫЛО БЫ' if check_only else 'ИТОГО'}: {total_before/1048576:.1f} -> {total_after/1048576:.1f} МБ "
          f"(−{(total_before-total_after)/1048576:.1f} МБ, −{(total_before-total_after)*100//max(1,total_before)}%), файлов изменено: {changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
