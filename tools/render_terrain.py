#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Офлайн-рендер прохода рельефа НАСТОЯЩИМ WebGPU — чтобы видеть кадр движка
там, где браузера с WebGPU нет.

Зачем. WGSL компилируется только в рантайме, на устройстве игрока, а в
песочнице, где эти шейдеры правятся, navigator.gpu отсутствует даже у
headless-хрома. tools/wgsl_check.mjs рядом ловит ошибки КОМПИЛЯЦИИ, но
молчит про то, что шейдер честно работает и рисует не то. Ровно так и вышло
с разметкой регионов: она сэмплировалась верно, но подмешивалась в albedo ДО
умножения на освещение, и на затенённом склоне сдвиг цвета в тридцать единиц
превращался на экране в девять — «прошёлся камерой по всей карте, границ
нигде нет».

Как это работает без видеокарты: wgpu-native (за wgpu-py) умеет в Vulkan, а
Vulkan — в программный растеризатор lavapipe из Mesa. Получается настоящая
реализация WebGPU, только медленная. Шейдер берётся ПРЯМО из
engine/src/renderer.ts (вырезается регуляркой), текстуры — настоящие,
геометрия чанка строится кодом самого движка (tools/gen_terrain_chunk.mjs
рядом). То есть проверяется тот же код, что поедет игроку, а не его копия.

Чего тут нет: теней (теневая карта пустая — всё освещено), декора, моделей,
неба. Проход рельефа и только он.

  apt-get install -y mesa-vulkan-drivers      # lavapipe
  pip install wgpu pillow numpy
  node tools/gen_terrain_chunk.mjs <модули> <cx> <cz> <радиус> <шаг> <выход>
  python3 tools/render_terrain.py <overlay.png> <cx> <cz> <высота> <дист> <чанк.vtx> <выход.png>

Переменная окружения DEBUG_OVERLAY=1 переключает вывод на отладочный: в
красном канале альфа из текстуры разметки, в зелёном её красная компонента,
в синем — попал ли фрагмент в границы карты.

Переменная OWNERS задаёт владельцев областей (Фаза 55) в виде
"номер:#цвет" через запятую, например OWNERS=11:#8e2b22 — область 11 под
червлёным знаменем. Без неё все области ничейные, и кадр должен выйти
БАЙТ В БАЙТ таким же, каким выходил до появления покраски.
"""
import re, sys, math
import numpy as np, wgpu
from PIL import Image
import wgpu.utils

ROOT = "/home/user/4-"
W, H = 900, 560
SHADOW_MAP_SIZE = 2048

src = open(f"{ROOT}/engine/src/renderer.ts", encoding="utf-8").read()
m = re.search(r"const TERRAIN_SHADER = /\* wgsl \*/ `([\s\S]*?)`;", src)
code = m.group(1).replace("${SHADOW_MAP_SIZE.toFixed(1)}", f"{SHADOW_MAP_SIZE:.1f}")
import os
if os.environ.get("DEBUG_OVERLAY"):
    # отладка: вместо цвета земли выводим то, что реально вернула выборка
    code = code.replace("return vec4f(mix(lit, fog.color.rgb, f), 1.0);",
        "return vec4f(regionC.a, regionC.rgb.r, select(0.0,1.0,inRegionBounds), 1.0);")
    print("отладочный вывод: R=alpha из текстуры, G=red из текстуры, B=inRegionBounds")

dev = wgpu.utils.get_default_device()

def tex_from_png(path, srgb=False):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im, dtype=np.uint8)
    t = dev.create_texture(size=(im.width, im.height, 1), format=wgpu.TextureFormat.rgba8unorm,
                           usage=wgpu.TextureUsage.TEXTURE_BINDING | wgpu.TextureUsage.COPY_DST)
    dev.queue.write_texture({"texture": t}, a.tobytes(), {"bytes_per_row": im.width*4}, (im.width, im.height, 1))
    return t

GROUND = ["ground/sand.jpg","ground/grass.jpg","ground/dry_meadow.jpg","ground/scree.jpg","ground/rock.jpg",
          "ground/snow.jpg","ground/forest_floor.jpg","ground/desert.jpg","ground/marsh.jpg",
          "ground/tundra_moss.jpg","water/detail.jpg"]
texs = [tex_from_png(f"{ROOT}/textures/{p}") for p in GROUND]
overlay = tex_from_png(sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/textures/world/regions_overlay.png")

# Фаза 55 — карта номеров областей (binding 18) и цвета их владельцев
# (binding 19). Файл сырой, не PNG: те же 600×300 байт, что читает и движок.
REGION_MAP_W, REGION_MAP_H = 600, 300
rid_bytes = open(f"{ROOT}/heightmap/region-map-v1.bin", "rb").read()
assert len(rid_bytes) == REGION_MAP_W * REGION_MAP_H, len(rid_bytes)
region_id_tex = dev.create_texture(size=(REGION_MAP_W, REGION_MAP_H, 1), format=wgpu.TextureFormat.r8unorm,
                                   usage=wgpu.TextureUsage.TEXTURE_BINDING | wgpu.TextureUsage.COPY_DST)
dev.queue.write_texture({"texture": region_id_tex}, rid_bytes,
                        {"bytes_per_row": REGION_MAP_W}, (REGION_MAP_W, REGION_MAP_H, 1))

# Кому какая область принадлежит. По умолчанию — никому (все альфы нули, и
# кадр обязан выйти в точности таким же, каким выходил до Фазы 55).
#   OWNERS="11:#8e2b22,9:#334a6b"  — область 11 червлёная, область 9 лазурная.
owners = np.zeros(16 * 4, dtype=np.float32)
for pair in filter(None, os.environ.get("OWNERS", "").split(",")):
    idx, hexc = pair.split(":")
    hexc = hexc.lstrip("#")
    i = int(idx)
    owners[i*4:i*4+3] = [int(hexc[k:k+2], 16) / 255.0 for k in (0, 2, 4)]
    owners[i*4+3] = 1.0
owners_buf = dev.create_buffer_with_data(data=owners.tobytes(), usage=wgpu.BufferUsage.UNIFORM)

samp = dev.create_sampler(address_mode_u="repeat", address_mode_v="repeat", mag_filter="linear", min_filter="linear")
shadow_samp = dev.create_sampler(compare="less")
shadow_tex = dev.create_texture(size=(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 1), format=wgpu.TextureFormat.depth32float,
                                usage=wgpu.TextureUsage.TEXTURE_BINDING | wgpu.TextureUsage.RENDER_ATTACHMENT)
# теневая карта пустая (всё освещено) — тени тут не проверяем
enc = dev.create_command_encoder()
p = enc.begin_render_pass(color_attachments=[], depth_stencil_attachment={
    "view": shadow_tex.create_view(), "depth_clear_value": 1.0, "depth_load_op": "clear", "depth_store_op": "store"})
p.end(); dev.queue.submit([enc.finish()])

def mat_look(eye, target, up=(0,1,0)):
    z = np.array(eye)-np.array(target); z = z/np.linalg.norm(z)
    x = np.cross(up, z); x = x/np.linalg.norm(x)
    y = np.cross(z, x)
    m = np.eye(4, dtype=np.float32)
    m[:3,0]=x; m[:3,1]=y; m[:3,2]=z
    m[3,0]=-np.dot(x,eye); m[3,1]=-np.dot(y,eye); m[3,2]=-np.dot(z,eye)
    return m
def mat_persp(fovy, aspect, n, f):
    t = 1/math.tan(fovy/2); m = np.zeros((4,4), dtype=np.float32)
    m[0,0]=t/aspect; m[1,1]=t; m[2,2]=f/(n-f); m[2,3]=-1; m[3,2]=f*n/(n-f)
    return m

CX, CZ = float(sys.argv[2]) if len(sys.argv)>2 else 440.0, float(sys.argv[3]) if len(sys.argv)>3 else -480.0
GROUND_Y = float(sys.argv[4]) if len(sys.argv)>4 else 11.0
DIST = float(sys.argv[5]) if len(sys.argv)>5 else 42.0
yaw, pitch = 0.55, 0.5
target = np.array([CX, GROUND_Y+2, CZ], dtype=np.float32)
eye = target + np.array([math.sin(yaw)*math.cos(pitch)*DIST, math.sin(pitch)*DIST, math.cos(yaw)*math.cos(pitch)*DIST])
vp = (mat_look(eye, target) @ mat_persp(0.72, W/H, 0.5, 900.0)).astype(np.float32)

vp_buf = dev.create_buffer_with_data(data=vp.tobytes(), usage=wgpu.BufferUsage.UNIFORM)
fog = np.zeros(8, dtype=np.float32); fog[:3]=eye; fog[3]=0.0
fog[4:7]=[0.62,0.68,0.76]; fog[7]=0.00035
fog_buf = dev.create_buffer_with_data(data=fog.tobytes(), usage=wgpu.BufferUsage.UNIFORM)
light_buf = dev.create_buffer_with_data(data=np.eye(4,dtype=np.float32).tobytes(), usage=wgpu.BufferUsage.UNIFORM)

vtx = np.fromfile(sys.argv[6] if len(sys.argv)>6 else f"{'/'.join(__file__.split('/')[:-1])}/chunk.vtx", dtype=np.float32)
nvert = vtx.size // 15
vbuf = dev.create_buffer_with_data(data=vtx.tobytes(), usage=wgpu.BufferUsage.VERTEX)

module = dev.create_shader_module(code=code)
attrs = [{"shader_location":0,"offset":0,"format":"float32x3"},
         {"shader_location":1,"offset":12,"format":"float32x3"},
         {"shader_location":2,"offset":24,"format":"float32x3"},
         {"shader_location":3,"offset":36,"format":"float32x2"},
         {"shader_location":4,"offset":44,"format":"float32"},
         {"shader_location":5,"offset":48,"format":"float32"},
         {"shader_location":6,"offset":52,"format":"float32"},
         {"shader_location":7,"offset":56,"format":"float32"}]
pipe = dev.create_render_pipeline(
    layout="auto",
    vertex={"module":module,"entry_point":"vs","buffers":[{"array_stride":60,"attributes":attrs}]},
    fragment={"module":module,"entry_point":"fs","targets":[{"format":wgpu.TextureFormat.rgba8unorm}]},
    primitive={"topology":"triangle-list","cull_mode":"back"},
    depth_stencil={"format":wgpu.TextureFormat.depth24plus,"depth_write_enabled":True,"depth_compare":"less"})

entries = [{"binding":0,"resource":{"buffer":vp_buf,"offset":0,"size":vp_buf.size}},
           {"binding":1,"resource":{"buffer":fog_buf,"offset":0,"size":fog_buf.size}},
           {"binding":2,"resource":samp}]
for i,t in enumerate(texs[:5]): entries.append({"binding":3+i,"resource":t.create_view()})
entries += [{"binding":8,"resource":{"buffer":light_buf,"offset":0,"size":light_buf.size}},
            {"binding":9,"resource":shadow_samp},
            {"binding":10,"resource":shadow_tex.create_view()}]
for i,t in enumerate(texs[5:11]): entries.append({"binding":11+i,"resource":t.create_view()})
entries.append({"binding":17,"resource":overlay.create_view()})
entries.append({"binding":18,"resource":region_id_tex.create_view()})
entries.append({"binding":19,"resource":{"buffer":owners_buf,"offset":0,"size":owners_buf.size}})
bg = dev.create_bind_group(layout=pipe.get_bind_group_layout(0), entries=entries)

color = dev.create_texture(size=(W,H,1), format=wgpu.TextureFormat.rgba8unorm,
    usage=wgpu.TextureUsage.RENDER_ATTACHMENT | wgpu.TextureUsage.COPY_SRC)
depth = dev.create_texture(size=(W,H,1), format=wgpu.TextureFormat.depth24plus, usage=wgpu.TextureUsage.RENDER_ATTACHMENT)
enc = dev.create_command_encoder()
rp = enc.begin_render_pass(
    color_attachments=[{"view":color.create_view(),"clear_value":(0.62,0.68,0.76,1),"load_op":"clear","store_op":"store"}],
    depth_stencil_attachment={"view":depth.create_view(),"depth_clear_value":1.0,"depth_load_op":"clear","depth_store_op":"store"})
rp.set_pipeline(pipe); rp.set_bind_group(0, bg); rp.set_vertex_buffer(0, vbuf); rp.draw(nvert)
rp.end()
dev.queue.submit([enc.finish()])
out = dev.queue.read_texture({"texture":color}, {"bytes_per_row":W*4}, (W,H,1))
img = np.frombuffer(out, dtype=np.uint8).reshape(H,W,4)
Image.fromarray(img[...,:3]).save(sys.argv[7] if len(sys.argv)>7 else "/tmp/terrain.png")
print("кадр отрисован:", sys.argv[7] if len(sys.argv)>7 else "/tmp/terrain.png", "| вершин:", nvert)
