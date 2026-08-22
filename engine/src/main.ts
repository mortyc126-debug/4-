/* =========================================================================
   Честная перспективная камера (управляемая — см. camera.ts) над куском
   ТОГО ЖЕ рельефа, что и в живой игре (тот же SEED, см. terrain.ts) —
   остров узнаваем. Город/лагерь/точки — настоящие .glb-модели той же игры
   (см. glb.ts/modelRenderer.ts), стоят прямо на рельефе на своей мировой
   высоте. Пин-маркер (пирамидка) из ранних шагов прототипа переиспользован
   как подсветка выбранной сущности (см. клик ниже) — больше он ни для чего
   не нужен.
   ========================================================================= */
import { createWorld, addEntity, addComponent, removeEntity, query } from "bitecs";
import { createRenderer, type MarkerEntity, type DecorEntity } from "./renderer";
import { buildTerrainPatch } from "./terrainMesh";
import { heightAt, HMAX, hash2, noise, isWater, SEED, registerFlattenSite, WORLD_HALF_X, WORLD_HALF_Z, forestMaskAt, loadHeightmapData } from "./terrain";
import { PINE, LEAF, GRASS_TONES, BUSH_TONES, ROCK_TONES } from "./decorMesh";
import { mul, persp, look, modelMatrix, transformPoint, sub, cross, norm, type Vec3, type Mat4 } from "./mat4";
import { attachOrbitControls, type OrbitCamera } from "./camera";
import { loadGLB } from "./glb";
import { uploadGLB, createModelPipeline, type GpuModel, type ModelInstance } from "./modelRenderer";
import { loadRealEntities, getOwnCityPos, type RealEntity } from "./realData";
import { loadLiveMarches, type LiveMarchPos } from "./marchData";

const statusEl = document.getElementById("status") as HTMLDivElement;
// Фаза 16 — #status раньше показывался КАЖДОМУ игроку постоянно (не только
// разработчику): "инициализация…", потом "модели: загружено X/Y", "рельеф:
// чанков N..." — и висел так до конца сессии. Автор сообщил "у тебя
// наложились две загрузки друг на друга" — это оно и было: второй, отдельный
// от видео-заставки родительской страницы (index.html, #mp-loading)
// текстовый индикатор в том же верхнем углу. Полезен при живой отладке (см.
// историю этого файла — не раз спасал на телефоне без доступа к devtools),
// поэтому не убираем совсем, а прячем за ?debug=1: разработчик добавляет
// его вручную в адресе игры (проверяем location родителя, раз движок открыт
// внутри iframe — сам он никакого query не получает), обычный игрок этого
// параметра никогда не наберёт.
const DEBUG_STATUS = (() => {
  try {
    if (/[?&]debug=1\b/.test(location.search)) return true;
    if (window.parent && window.parent !== window) return /[?&]debug=1\b/.test(window.parent.location.search);
  } catch (_) {
    /* кросс-origin — считаем, что отладка не запрошена */
  }
  return false;
})();
if (DEBUG_STATUS) statusEl.style.display = "block";
function setStatus(lines: string[]) {
  if (!DEBUG_STATUS) return;
  statusEl.textContent = lines.join("\n");
}
// Настоящий сбой (main().catch ниже) — не рутинная диагностика, скрывать её
// за ?debug=1 нельзя: без неё игрок увидел бы совсем пустой экран без
// единой подсказки, что вообще произошло (тот же довод, что и у
// #gpu-error-banner при потере устройства — честная причина лучше тишины).
function setErrorStatus(lines: string[]) {
  statusEl.style.display = "block";
  statusEl.textContent = lines.join("\n");
}

async function main() {
  const lines: string[] = [];

  // Фаза 16 — если WebGPU в принципе недоступен (нет navigator.gpu — обычно
  // старый браузер/устройство без поддержки), нет смысла ждать "вдруг
  // заработает": сразу откатываем на 2D-карту города, тем же forceCityView(),
  // что и у повторной потери уже работавшего устройства (см. device.lost
  // ниже). Эта самая дешёвая (синхронная) проверка нарочно поднята в САМОЕ
  // начало main() — раньше остального кода вообще, включая свежую загрузку
  // настоящего рельефа (loadHeightmapData ниже, ~8.6МБ): без этого
  // устройство без WebGPU сначала скачало бы весь рельеф впустую, а только
  // потом узнало, что рисовать всё равно нечем — на медленной связи это
  // реальные лишние секунды/десятки секунд ожидания ради ничего. Остальные
  // проверки (адаптер/устройство/контекст, дороже и асинхронные) остались
  // на прежнем месте ниже — они уже сами по себе быстрее одной большой
  // закачки, реорганизовывать их не было нужды.
  function bailNoWebGpu(message: string): void {
    setErrorStatus([...lines, message]);
    try {
      if (window.parent && window.parent !== window && typeof (window.parent as any).forceCityView === "function") {
        (window.parent as any).forceCityView();
      }
    } catch (_) {
      /* кросс-origin — баннер/статус остаётся единственной обратной связью */
    }
  }
  if (!("gpu" in navigator)) {
    bailNoWebGpu("WebGPU: navigator.gpu отсутствует.");
    return;
  }

  // Настоящий рельеф грузится асинхронно (см. terrain.ts, loadHeightmapData
  // — три бинарных файла: высоты, лес, влажность). Раньше heightAt был
  // чистым noise(), доступным сразу же; первому вызову ниже
  // (registerFlattenSite для стартовых сущностей, первые чанки рельефа)
  // физически неоткуда взять высоту без сети — ждём загрузки здесь, один
  // раз, до первой сущности/чанка (но уже ПОСЛЕ проверки WebGPU выше).
  await loadHeightmapData();
  lines.push("рельеф: настоящие данные высот загружены");

  // Чанк 16×16 — то же пространство координат, что и STRUCT_CHUNK в
  // index.html (см. ensureChunkContent/W.mapChunks): и рельеф (ниже), и
  // отбор сущностей на рендер (realData.ts) стримятся вокруг камеры одной
  // и той же сеткой.
  const CHUNK_SIZE = 16;
  const LOAD_RADIUS = 3; // 7×7=49 чанков вокруг камеры — тот же порядок вершин, что уже выдержал стресс-тест на 60 к/с
  const UNLOAD_RADIUS = 5; // с запасом против дребезга на границе загрузки/выгрузки
  // Дальнее грубое кольцо рельефа (объявлено ниже как FAR_CHUNK_SIZE/
  // FAR_UNLOAD_RADIUS, значения подняты сюда — entity-радиусу они нужны
  // раньше, чем сам дальний рельеф) — тянется на FAR_UNLOAD_RADIUS×
  // FAR_CHUNK_SIZE клеток. Было 6×64=384, поднято до 7×64=448 вместе с
  // MAX_DIST в camera.ts (100→140, автор попросил сильнее отдалять камеру
  // для быстрого перемещения/обзора рельефа, но тут же в этой сессии
  // просил и следить за быстродействием — см. её же комментарий: шаг
  // умеренный, не на максимум, который в принципе можно было бы выжать).
  const FAR_CHUNK_SIZE = 64;
  const FAR_UNLOAD_RADIUS = 7;
  // Раньше ENTITY_RADIUS считался от УЖЕ УСТАРЕВШЕГО ориентира — радиуса
  // выгрузки БЛИЖНЕГО рельефа ((UNLOAD_RADIUS+1)×CHUNK_SIZE = 96), с
  // комментарием "не должны пропадать раньше земли под ними". Но земля НЕ
  // пропадает на 96 клетках — там кончается только детальный слой, а
  // дальнее грубое кольцо тянется до 448 (см. FAR_UNLOAD_RADIUS выше).
  // Реальный репорт игрока ("точки пропадают при отдалении камеры, иногда
  // прямо на глазах") — ровно это: syncLiveEntities (см. ниже) каждые 3с
  // выгружает всё, что дальше 96 от cam.target, а земля под моделью на
  // 100-300 клетках всё ещё честно нарисована — модель исчезает, площадка
  // остаётся. Плюс сама цель камеры не идеально стоит на месте (инерция
  // жеста), так что сущности у самой границы 96 мерцали туда-обратно между
  // соседними опросами. ENTITY_RADIUS теперь равен радиусу ДАЛЬНЕГО кольца
  // — той же гарантии, что уже проверена для рельефа: если земля ещё
  // нарисована, сущность на ней тоже обязана быть загружена.
  const ENTITY_RADIUS = FAR_UNLOAD_RADIUS * FAR_CHUNK_SIZE;
  const DEMO_CENTER = { x: 42, y: 22 }; // примерный центр демо-сущностей (см. seedEntities ниже)

  // ---- туман по расстоянию (см. renderer.ts/modelRenderer.ts) — тёплая
  // дымка вместо резкого обрыва рельефа/зданий вдали. Цвет — тот же, что и
  // очистка канвы (renderer.frame ниже): за пределами прорисованной земли
  // (дальше дальнего кольца рельефа, см. FAR_* ниже) должен быть визуально
  // тот же тон, что и дымка над самой землёй — иначе всё равно виден край.
  // Тёплый золотистый оттенок, а не яркое голубое небо — ближе по духу к
  // общей золотисто-пергаментной палитре игры (см. GILT/тема index.html),
  // чем к реалистичному дневному небу.
  //
  // Автор с живого сайта: мир выглядит "на отъебись", а не как у AAA-игр —
  // прежний [0.42,0.4,0.37] был почти обесцвеченным грязно-серым (никакой
  // атмосферы, только мутная пелена) — заодно тем же плоским тоном красился
  // и весь ambient рельефа/декора/зданий (см. renderer.ts/modelRenderer.ts:
  // тень раньше была просто темнее той же текстуры, без цвета вообще).
  // Теперь дымка ощутимо ярче и золотистее — та же "золотой час" палитра,
  // что и у нового полусферного ambient там же (SKY_TINT/SUN_LIGHT — держать
  // тон в одном семействе, иначе горизонт и освещение земли будут спорить
  // друг с другом).
  //
  // FOG_K было 0.0042 — задумывалось ещё под процедурный бесконечный мир,
  // где туман честно скрывал границу того, что вообще успело сгенерироваться
  // и подгрузиться. Автор с живого устройства: карта теперь целиком
  // статичный настоящий рельеф (см. terrain.ts — все данные скачаны ОДИН
  // раз при заходе в Мир, дальше ничего по сети не подгружается вообще,
  // см. её же комментарий у loadHeightmapData), туман прежней плотности
  // читался как непонятное "замыливание" вместо честной картинки. Съедать
  // видимость больше не для чего — рельеф до самого края дальнего кольца
  // (см. FAR_UNLOAD_RADIUS ниже) уже полностью посчитан и лежит в памяти,
  // прятать нечего. FOG_K — квадратично-экспоненциальный коэффициент
  // (f=1-exp(-(d·k)²)): f≈0.08 на 150 клетках (было заметно раньше), f≈0.4
  // у самого края дальнего кольца — лёгкая атмосферная дымка на самом
  // горизонте, не плотная пелена на пол-экрана. Пересчитан вслед за
  // FAR_UNLOAD_RADIUS (384→448 клеток, см. её же комментарий — автор попросил
  // отдалять камеру сильнее) — та же форма кривой, просто растянутая под
  // новый край дальнего кольца, а не отдельная перенастройка "на глаз". Не
  // проверено визуально (WebGPU-канва не читается в этой песочнице никаким
  // способом) — нужна обратная связь с реального устройства для точной
  // подгонки.
  const FOG_COLOR: [number, number, number] = [0.6, 0.52, 0.4];
  const FOG_K = 0.0016;

  // ---- bitECS: настоящие данные партии, если движок открыт внутри игры
  // (см. realData.ts — читает window.parent.W), иначе те же четыре
  // придуманные сущности демо, что и раньше. Масштаб моделей — как в
  // живой игре (город 10×, лагерь/точка 5×, форт покрупнее — 6.5×).
  //
  // loadRealEntities теперь принимает центр+радиус (см. Фазу 5 плана
  // бесконечного мира) — при настоящей партии сущностей может быть сколько
  // угодно по мере исследования, полный перебор W.map на каждую загрузку/
  // опрос не годится. Центр для ПЕРВОГО вызова — позиция своего города,
  // читается напрямую из W.players[0] через getOwnCityPos(), в обход
  // loadRealEntities целиком: иначе курица и яйцо (чтобы найти свой город
  // через loadRealEntities, нужен уже готовый центр отбора).
  const ownPos = getOwnCityPos();
  const initialCenter = ownPos ?? DEMO_CENTER;
  const real = loadRealEntities(initialCenter.x, initialCenter.y, ENTITY_RADIUS);
  const usingReal = real !== null;
  // Отладочная сводка (#status) полезна в отдельном/демо-режиме, но
  // не игроку живой партии поверх настоящей сцены — не тот же экран, что
  // тестировался пиксель в пиксель, реальный контент виден и без неё,
  // а на живом скриншоте она перекрывала верхний левый угол.
  if (window.parent !== window) statusEl.style.display = "none";
  const seedEntities: RealEntity[] =
    real ??
    [
      { key: "demo-0", x: 43, y: 14, gx: 43, gy: 14, kind: 0 as const, model: "/models/castles/human-1.glb", scale: 10, nm: "Замок", lv: "демо" },
      { key: "demo-1", x: 50, y: 20, gx: 50, gy: 20, kind: 1 as const, model: "/models/camps/barbarians.glb", scale: 5, nm: "Лагерь", lv: "демо" },
      { key: "demo-2", x: 55, y: 12, gx: 55, gy: 12, kind: 2 as const, model: "/models/resources/farm.glb", scale: 5, nm: "Пашня", lv: "демо" },
      { key: "demo-3", x: 30, y: 30, gx: 30, gy: 30, kind: 2 as const, model: "/models/resources/quarry.glb", scale: 5, nm: "Каменоломня", lv: "демо" },
    ];
  lines.push(usingReal ? `данные: настоящая партия, сущностей — ${seedEntities.length}` : "данные: демо (window.parent.W недоступен)");

  const world = createWorld();
  const Position = { x: [] as number[], y: [] as number[] };
  const Kind = { value: [] as number[] }; // 0=city 1=camp 2=node
  const modelPathOf = new Map<number, string>();
  const modelScaleOf = new Map<number, number>();
  // nm/lv раздельно — используются и панелью выбора (клик, склеены через
  // " · "), и постоянными ambient-подписями над моделями (см. draw() ниже,
  // отдельными строками — тот же состав, что и labelContent() в
  // obyom-3d-infinite.html).
  const nmOf = new Map<number, string>();
  const lvOf = new Map<number, string>();
  const ownOf = new Map<number, boolean>();
  // Целая клетка карты (не мировая x+0.5/y+0.5 из Position) — нужна только
  // для window.parent.renderCartoucheFor(gx,gy) при клике (см. ниже): та же
  // клетка, которую ждёт cartouche в index.html.
  const gridOf = new Map<number, { x: number; y: number }>();
  // Ключ клетки карты ("x,y", как в W.map) -> bitECS id — нужен только для
  // диффа при живой синхронизации ниже (syncLiveEntities): по нему находим,
  // какая сущность уже есть, а какая пропала между двумя опросами
  // window.parent.W. В демо-режиме не используется (там синка нет).
  const keyToEid = new Map<string, number>();
  function spawnEntity(e: RealEntity): number {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Kind);
    Position.x[eid] = e.x;
    Position.y[eid] = e.y;
    Kind.value[eid] = e.kind;
    modelPathOf.set(eid, e.model);
    modelScaleOf.set(eid, e.scale);
    nmOf.set(eid, e.nm);
    lvOf.set(eid, e.lv);
    ownOf.set(eid, !!e.own);
    gridOf.set(eid, { x: e.gx, y: e.gy });
    keyToEid.set(e.key, eid);
    // Плоская площадка под фундамент (см. terrain.ts registerFlattenSite) —
    // без неё на склоне модель на глаз "тонет" в один край рельефа и
    // "парит" над другим (тот самый баг со скриншота: город/лагерь/точка
    // выглядят вросшими в текстуру земли). Регистрируется ДО первой сборки
    // меша чанка под этой сущностью (см. вызовы spawnEntity ниже —
    // стартовые сущности идут раньше updateTerrainChunks/updateFarTerrain),
    // так что первый же меш уже учитывает площадку, а не подгоняется
    // задним числом. Радиус площадки — ×1.4 от номинального scale модели,
    // не голый scale: реальная модель (стены, крыша, пристройки) обычно
    // выступает за свой "номинальный" радиус, и с плотным запасом край
    // фундамента иногда всё ещё попадал на необработанный склон — ровно тот
    // просвет между зданием и землёй, который заметил пользователь на новом
    // скриншоте (та же природа бага, что и раньше, только запаса было мало).
    registerFlattenSite(e.x, e.y, e.scale * 1.4);
    return eid;
  }
  for (const e of seedEntities) spawnEntity(e);
  let found = Array.from(query(world, [Position, Kind]));
  lines.push(`bitECS: сущностей — ${found.length}`);

  // ---- WebGPU ----
  // navigator.gpu уже проверен в самом начале main() (см. её комментарий
  // там) — bailNoWebGpu определена там же, используется тут и ниже для
  // оставшихся, более дорогих асинхронных проверок (адаптер/устройство/
  // контекст).
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    bailNoWebGpu("WebGPU: адаптер не найден.");
    return;
  }
  const device = await adapter.requestDevice();
  // GPU-ошибки валидации (например, из-за багов в шейдерах, layout'ах,
  // текстурах) не бросают JS-исключение и не проходят через main().catch()
  // ниже — иначе они бы никогда не долетели до отладки на телефоне (там нет
  // доступа к devtools, а #status спрятан внутри iframe, см. ниже). Баннер
  // виден всегда, встроен ли движок в игру или открыт отдельно.
  function showGpuBanner(message: string) {
    let banner = document.getElementById("gpu-error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "gpu-error-banner";
      banner.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;" +
        "font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;";
      document.body.appendChild(banner);
    }
    banner.textContent += (banner.textContent ? "\n---\n" : "") + message;
  }
  device.addEventListener("uncapturederror", (event) => {
    const message = (event as GPUUncapturedErrorEvent).error.message;
    console.error("WebGPU error:", message);
    showGpuBanner(message);
  });
  // "Белый экран спустя время, без перезагрузки" — не гонка layout'а (та
  // чинилась ResizeObserver'ом выше), а живая потеря GPU-устройства
  // (device.lost — драйвер сбросился, не хватило памяти, вкладка ушла в
  // фон и ОС отобрала GPU-контекст у неё). После потери ЛЮБОЙ вызов к
  // устройству становится no-op — рельеф/декор/модели молча перестают
  // рисоваться, а весь остальной JS (bitECS, подписи над сущностями)
  // как ни в чём не бывало продолжает крутиться: тот же обманчивый
  // симптом, что и у прошлых двух багов. Полноценно пересоздать всю сцену
  // на новом device на лету — отдельный большой рефакторинг, а простая и
  // рекомендованная самой спецификацией WebGPU перезагрузка страницы даёт
  // тот же результат для пользователя (свежий адаптер/device) без него.
  // reason "destroyed" — само устройство намеренно уничтожили НАШИМ же
  // кодом (нигде не вызываем device.destroy(), так что этой ветки на
  // практике не бывает) — на неё перезагружаться не нужно.
  // Фаза 16 — если device.lost повторяется СРАЗУ ЖЕ после предыдущей
  // перезагрузки (не "устройство потерялось раз за час игры", а "снова
  // потерялось меньше чем через минуту после того, как мы сами только что
  // перезагрузили страницу ради него же") — сам адаптер на этом устройстве,
  // судя по всему, нестабилен (старый драйвер/софтверный рендер/эмуляция),
  // и бесконечный цикл "потеряли → reload → потеряли снова" для игрока
  // выглядит как зависшая/пустая страница (пользователь сообщил именно это:
  // "загрузка была, а замка и точек нет"). sessionStorage переживает
  // location.reload() (это НЕ новая вкладка), но не переживает закрытие
  // вкладки — значит, при следующем визите движок честно попробует WebGPU
  // заново, а не запомнит поломку навсегда для устройства, которое могло
  // уже починиться (обновился драйвер/браузер).
  const RELOAD_KEY = "fb-gpu-reload-at";
  const lastReloadAt = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  const reloadedRecently = lastReloadAt && Date.now() - lastReloadAt < 60000;
  device.lost.then((info) => {
    console.error("WebGPU device lost:", info.reason, info.message);
    if (info.reason === "destroyed") return;
    if (reloadedRecently) {
      // Второй раз подряд — не долбим reload вхолостую. Показываем понятную
      // причину и, если движок открыт внутри игры (iframe), откатываем
      // пользователя на 2D-карту города — она без WebGPU и уже отрисована.
      showGpuBanner(
        `WebGPU-устройство теряется повторно (${info.reason}) — похоже, объёмная карта нестабильна ` +
          `на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`
      );
      try {
        if (window.parent && window.parent !== window && typeof (window.parent as any).forceCityView === "function") {
          (window.parent as any).forceCityView();
        }
      } catch (_) {
        /* кросс-origin — молча оставляем баннер как единственную обратную связь */
      }
      return;
    }
    showGpuBanner(`WebGPU-устройство потеряно (${info.reason}): ${info.message}\nПерезагрузка через 2с...`);
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    setTimeout(() => location.reload(), 2000);
  });
  const canvas = document.getElementById("gpu") as HTMLCanvasElement;
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    bailNoWebGpu("WebGPU: getContext('webgpu') вернул null.");
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  // Скрытая канва (нулевой размер) НЕ пересчитывается — прежний размер
  // сохраняется как есть.
  // Здесь была причина зависаний на 5-10 секунд при частом переключении
  // Город<->Мир: вкладка "Город" прячет контейнер 3D через display:none
  // (#app.view-city #chart), у канвы clientWidth/clientHeight обнуляются,
  // ResizeObserver дёргает resize(), и канва схлопывалась в 1x1. Это не
  // косметика: смена размера канвы пересобирает swapchain, а ensureDepth()
  // видит новый размер и УНИЧТОЖАЕТ полноэкранную depth-текстуру, чтобы
  // создать её заново (renderer.ts). На возврате в "Мир" всё то же самое
  // происходит обратно — то есть каждое переключение туда-обратно стоило
  // двух полных перевыделений экранных GPU-текстур. Несколько переключений
  // подряд — и драйвер уходит в долгую переупаковку памяти, особенно на
  // телефоне. Игнорируя нулевой размер, мы просто НИЧЕГО не пересоздаём:
  // канва остаётся ровно той, какой была, и возврат во вкладку бесплатен.
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(cw * dpr));
    const h = Math.max(1, Math.floor(ch * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }
  // Скрыта ли канва прямо сейчас (вкладка "Город"). offsetParent===null —
  // самый дешёвый признак display:none у самого элемента или любого предка,
  // без чтения стилей и без layout-запроса.
  const isHidden = () => canvas.offsetParent === null && canvas.clientWidth === 0;
  resize();
  // ResizeObserver, не только window "resize" — тот не срабатывает, если
  // финальный layout канвы устаканивается ПОСЛЕ первого запуска этого
  // скрипта (обычная гонка на перезагрузке внутри iframe: сам iframe ещё
  // не досчитал свой размер, clientWidth/clientHeight читаются нулями,
  // канва застревает 1×1 пикселем навсегда — ничего не рисуется, хотя
  // остальной JS, включая подписи над сущностями, продолжает работать как
  // ни в чём не бывало, тот же обманчивый симптом, что и у прошлого
  // шейдерного бага). ResizeObserver перевызывает resize() при любом
  // фактическом изменении размера канвы, когда бы layout ни досчитался.
  new ResizeObserver(resize).observe(canvas);
  ctx.configure({ device, format, alphaMode: "opaque" });
  lines.push(`WebGPU: устройство получено, формат — ${format}`);

  const renderer = await createRenderer(device, ctx, format);

  // ---- рельеф: поток чанков 16×16 вокруг цели камеры вместо одного патча
  // фиксированного размера — мир не заканчивается на границе одного острова
  // (см. camera.ts — свободная панорама). heightAt/groundColor/waterColor —
  // чистые процедурные функции от (x,y) без привязки к границам CFG.MAP
  // (см. terrain.ts), так что соседние чанки автоматически совпадают по
  // краю просто потому, что это один и тот же непрерывный шум, посчитанный
  // в разных прямоугольниках — сшивать нечего, специального алгоритма
  // склейки не нужно.
  function chunkKey(cx: number, cz: number): string {
    return cx + "," + cz;
  }
  // Мост движок↔игра (задел под Фазу 4 плана бесконечного мира): когда
  // движок встроен внутри партии, уведомляем родителя о новом чанке
  // рельефа, вошедшем в радиус загрузки — тот же приём-обёртка, что и
  // notifyParentCartouche ниже. В index.html такой функции пока нет
  // (появится вместе с генерацией дикого контента по чанкам) — вызов тихо
  // no-op до тех пор, ничего не ломает.
  function notifyParentChunk(cx: number, cz: number) {
    try {
      const w = window.parent;
      if (w && w !== window && typeof (w as any).ensureWorldChunk === "function") {
        (w as any).ensureWorldChunk(cx, cz);
      }
    } catch (_) {
      /* кросс-origin или не встроено — тихо игнорируем */
    }
  }
  // ---- декор (деревья/камни/трава) — процедурный, чанк-локальный, привязан
  // к тому же CHUNK_SIZE, что и рельеф: генерится/убирается вместе с ближним
  // детальным чанком земли под ним, не отдельным радиусом (декор не нужен
  // там, где уже не рисуется детальная земля).
  //
  // Пользователь явно попросил детализацию ценой FPS ("готов вытерпеть
  // 25 кадров, ради красоты") — плотность и число видов заметно выросли
  // против первой версии (была одна subgrid 4×4 и два вида дерева).
  //
  // Позже тот же автор заметил обратную сторону этой плотности: "выглядит,
  // будто хаотично накидали всего подряд и перемешали" — деревья и камни
  // стояли РАВНОМЕРНО по всей карте (TREE_FRACTION=0.82 — фиксированная
  // доля деревьев в КАЖДОЙ клетке-кандидате, без разницы между открытым
  // лугом и чащей). DECOR_CHANCE ниже по-прежнему решает, какие клетки
  // подсетки вообще станут кандидатами (грубое разрежение), но что именно
  // из кандидата вырастет — дерево, камень или ничего — теперь решает
  // forestMaskAt(wx,wz) (terrain.ts, крупные пятна леса с линией
  // деревьев по высоте) и сама высота: TREE_CHANCE_MIN/MAX и
  // ROCK_CHANCE_MIN/MAX ниже заменяют один фиксированный TREE_FRACTION.
  const DECOR_CELL = 4; // сторона подсетки деревьев/камней, кратно CHUNK_SIZE (÷4)
  const DECOR_CHANCE = 0.65;
  const TREE_CHANCE_MIN = 0.05; // вне лесного пятна — редкие одиночные деревья, не голое поле совсем
  const TREE_CHANCE_MAX = 0.9;  // в сердце лесного пятна — почти каждый кандидат
  const ROCK_CHANCE_MIN = 0.1;  // низина/луг — камень редкость, не через одного
  // Было 0.65 — автор с живого сайта: "много камней на горах". Camнь на
  // склоне должен читаться как деталь рельефа, не как сплошная каменная
  // осыпь на каждом втором кандидате — почти вдвое реже на самых крутых
  // участках.
  const ROCK_CHANCE_MAX = 0.4;
  const GRASS_CELL = 2; // трава — своя, более мелкая подсетка (гуще)
  const GRASS_CHANCE = 0.7;
  const BUSH_CELL = 3; // кусты — средний ярус между травой и деревьями, своя подсетка
  const BUSH_CHANCE = 0.35;
  // Хвойный/лиственный порог по высоте — хвоя на возвышенностях, лиственный
  // лес в низинах, а не вперемешку где попало. Раньше 0.50 — калибровано под
  // старый синтетический рельеф (потолок ~1.0-1.3). Теперь e — настоящая
  // высота (terrain.ts: 0.30 на ~90м, 2.30 на ~2500м, см. bake-скрипт) —
  // порог пересчитан под реальный субальпийский пояс Карпат (хвоя примерно
  // от ~1300м).
  const CONIFER_ELEVATION = 1.36;
  const decorByChunk = new Map<string, DecorEntity[]>();
  function jitterColor(base: readonly [number, number, number], k: number): [number, number, number] {
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  // Не ставим декор поверх/впритык к настоящим зданиям — минимальный отступ
  // от радиуса модели (тот же приём смягчения наложений, что уже
  // применялся для реальных сущностей друг относительно друга, см. план
  // "Смягчение наложений" — только тут двигаем не позицию структуры, а
  // просто пропускаем декор-кандидата). pad — доля радиуса модели: у травы
  // меньше (мелкая, не режет глаз у стен), у деревьев/камней больше.
  // Исходные pad/extra (1.6/2, 1.05/0.5, 1.3/1) читались как неестественно
  // широкое голое кольцо голой земли вокруг любой постройки на скриншоте —
  // отступ сокращён на 66% (×0.34) для всех трёх видов декора.
  // isWater(wx,wz) проверяет только САМУ точку-якорь декора — визуальный
  // силуэт (крона дерева, куст, пучок травы) шире одной точки и мог
  // нависать над берегом, если якорь лёг буквально на кромке воды
  // (пользователь заметил именно это). Проверяем несколько точек по
  // окружности радиуса margin вокруг якоря — дёшево (8 доп. heightAt) и
  // не требует знать реальный радиус модели тут же, в месте вызова.
  const WATER_MARGIN_RING = 8;
  function nearWater(wx: number, wz: number, margin: number): boolean {
    if (isWater(wx, wz)) return true;
    for (let k = 0; k < WATER_MARGIN_RING; k++) {
      const a = (k / WATER_MARGIN_RING) * Math.PI * 2;
      if (isWater(wx + Math.cos(a) * margin, wz + Math.sin(a) * margin)) return true;
    }
    return false;
  }
  function blockedByStructure(wx: number, wz: number, pad: number, extra: number): boolean {
    for (const eid of found) {
      const dx = Position.x[eid] - wx, dz = Position.y[eid] - wz;
      const minDist = (modelScaleOf.get(eid) ?? 5) * pad + extra;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    return false;
  }
  // Выбор вида дерева по высоте — та же цепочка вероятностей, что и в
  // прототипе (treeSpruce/treePine/treeBroad/treeBirch/treeDead): хвоя
  // (ель/сосна) на возвышенностях, лиственный лес (дуб/берёза) в низинах,
  // с редкой примесью другого вида и сухостоя в обоих случаях.
  function pickTreeKind(e: number, r: number): DecorEntity["kind"] {
    if (e > CONIFER_ELEVATION) {
      if (r < 0.62) return "spruce";
      if (r < 0.94) return "pine";
      return "dead";
    }
    if (r < 0.58) return "broadleaf";
    if (r < 0.80) return "birch";
    if (r < 0.94) return "spruce"; // редкая хвоя вперемешку в низине
    return "dead";
  }
  function genDecorForChunk(cx: number, cz: number): DecorEntity[] {
    const out: DecorEntity[] = [];
    const cellsPerSide = CHUNK_SIZE / DECOR_CELL;
    for (let j = 0; j < cellsPerSide; j++) {
      for (let i = 0; i < cellsPerSide; i++) {
        const gx = cx * cellsPerSide + i, gz = cz * cellsPerSide + j;
        if (hash2(gx, gz, SEED + 777) >= DECOR_CHANCE) continue;
        // Джиттер ужат до средних 65% клетки (не 0..DECOR_CELL целиком) —
        // иначе два дерева из СОСЕДНИХ клеток могли оказаться у общей
        // границы почти вплотную друг к другу (пользователь заметил
        // именно такие кучки на скриншоте). Плотность/число деревьев не
        // меняются, меняется только то, где именно внутри клетки они могут
        // оказаться.
        const jx = 0.175 + hash2(gx, gz, SEED + 778) * 0.65, jz = 0.175 + hash2(gx, gz, SEED + 779) * 0.65;
        const baseWx = cx * CHUNK_SIZE + i * DECOR_CELL + jx * DECOR_CELL;
        const baseWz = cz * CHUNK_SIZE + j * DECOR_CELL + jz * DECOR_CELL;
        // Домен-варп — та же техника, что и у самого рельефа (heightRaw:
        // X=x+wx... в terrain.ts). Без него декор на строгой подсетке
        // DECOR_CELL=4 визуально читается как решётка: где бы игрок ни
        // посмотрел, соседние деревья всегда примерно на одном и том же
        // расстоянии друг от друга — глаз улавливает период сетки, даже
        // когда джиттер внутри клетки честно случаен (жалоба автора:
        // "даже если они находятся на расстоянии каком-то определённом, то
        // они повсюду на таком расстоянии"). hash2 тут не годится — он
        // случаен только по ЦЕЛЫМ gx,gz, сдвинул бы решётку на новую
        // решётку той же природы; noise() непрерывен и сдвигает каждую
        // точку карты немного по-своему. Считаем варп от ДОисходных
        // (baseWx,baseWz), не последовательно от уже сдвинутой — иначе
        // сдвиг по Z зависел бы от уже применённого сдвига по X без нужды.
        const warp = 2.0;
        const wx = baseWx + (noise(baseWx / 8.5, baseWz / 8.5, SEED + 790) * 2 - 1) * warp;
        const wz = baseWz + (noise(baseWx / 8.5, baseWz / 8.5, SEED + 791) * 2 - 1) * warp;
        if (nearWater(wx, wz, 1.5)) continue; // деревья/камни — самый широкий силуэт
        if (blockedByStructure(wx, wz, 0.54, 0.68)) continue;
        const yaw = hash2(gx, gz, SEED + 781) * Math.PI * 2;
        const jitter = 0.85 + hash2(gx, gz, SEED + 782) * 0.3; // 0.85..1.15 — та же роль, что и tone/warm в старом прототипе
        const e = heightAt(wx, wz);
        // Раньше тут был порог "это уже граница мира/стена, декор не
        // сажаем" — стены-из-гор больше нет (мир теперь настоящий рельеф,
        // окружённый океаном, см. terrain.ts), высота никогда естественно
        // не улетает в космос, отдельный потолок не нужен — верхнюю границу
        // леса уже поставила сама природа (forestMaskAt читает настоящий
        // спутниковый покров, на голой вершине там просто нет леса).
        const wy = e * HMAX;
        // Дерево или камень для ЭТОГО конкретного кандидата решает не одна
        // фиксированная доля на всю карту, а forestMaskAt (пятно леса,
        // террейн.ts) для дерева и сама высота для камня — тот самый
        // переход от "везде поровну" к читаемым региона: густая роща тут,
        // редкий одинокий дуб посреди луга там, камни гуще на склоне, чем
        // в низине. hash2(...+780) — тот же бросок кубика, что раньше
        // сравнивался с фиксированным TREE_FRACTION, теперь с "плавающим"
        // порогом.
        const forest = forestMaskAt(wx, wz);
        const treeChance = TREE_CHANCE_MIN + (TREE_CHANCE_MAX - TREE_CHANCE_MIN) * forest;
        const isTree = hash2(gx, gz, SEED + 780) < treeChance;
        // Неравномерный масштаб (высота отдельно от ширины) — разные
        // силуэты одной геометрии почти бесплатно, см. DECOR_SHADER.
        const scaleY = 1.0 + hash2(gx, gz, SEED + 785) * 1.3;
        const scaleXZ = 0.8 + hash2(gx, gz, SEED + 786) * 0.5;
        if (isTree) {
          let kind = pickTreeKind(e, hash2(gx, gz, SEED + 780));
          // "дуб" делится на две отдельные текстуры кроны (обычная зелёная
          // и осенняя золотисто-оранжевая, см. decorKindSpec в renderer.ts)
          // — независимый бросок, не встроенный в саму цепочку видов выше,
          // чтобы не путать вероятности хвои/лиственного/сухостоя.
          if (kind === "broadleaf" && hash2(gx, gz, SEED + 787) < 0.35) kind = "autumn";
          // "dead" — голый ствол без кроны, свой цвет инстанса нигде не
          // используется (весь меш materialId=0, см. decorMesh.ts), но
          // структура DecorEntity общая — просто берём любую палитру.
          const palette = kind === "spruce" || kind === "pine" ? PINE : LEAF;
          const base = palette[Math.floor(hash2(gx, gz, SEED + 784) * palette.length)];
          out.push({
            x: wx, y: wy, z: wz, scale: [scaleXZ, scaleY, scaleXZ], yaw,
            color: jitterColor(base, jitter), kind,
          });
        } else {
          // Кандидат "не дерево" раньше ВСЕГДА становился камнем — сама
          // равномерная плотность камней по всей карте (даже на ровном
          // лугу) была частью той же жалобы. Теперь только доля из них,
          // растущая с высотой (склон/предгорье честно каменистее низины,
          // та же логика, что уже красит террейн в scree/rock повыше) —
          // остальные ничего не ставят, оставляя открытую траву/луг.
          // Делитель 0.65→1.6 — тот же пересчёт под настоящую высоту, что и
          // у CONIFER_ELEVATION выше (см. её комментарий): полная плотность
          // камня достигается примерно к реальным ~1600м, не к прежним
          // синтетическим отметкам.
          const rockChance = ROCK_CHANCE_MIN + (ROCK_CHANCE_MAX - ROCK_CHANCE_MIN) * Math.min(1, e / 1.6);
          if (hash2(gx, gz, SEED + 795) >= rockChance) continue;
          const base = ROCK_TONES[Math.floor(hash2(gx, gz, SEED + 784) * ROCK_TONES.length)];
          const rockScaleY = 0.6 + hash2(gx, gz, SEED + 785) * 0.9;
          const rockScaleXZ = 0.6 + hash2(gx, gz, SEED + 786) * 0.9;
          out.push({ x: wx, y: wy, z: wz, scale: [rockScaleXZ, rockScaleY, rockScaleXZ], yaw, color: jitterColor(base, jitter), kind: "rock" });
        }
      }
    }
    const grassCellsPerSide = CHUNK_SIZE / GRASS_CELL;
    for (let j = 0; j < grassCellsPerSide; j++) {
      for (let i = 0; i < grassCellsPerSide; i++) {
        const gx = cx * grassCellsPerSide + i, gz = cz * grassCellsPerSide + j;
        if (hash2(gx, gz, SEED + 887) >= GRASS_CHANCE) continue;
        const jx = hash2(gx, gz, SEED + 888), jz = hash2(gx, gz, SEED + 889);
        const wx = cx * CHUNK_SIZE + i * GRASS_CELL + jx * GRASS_CELL;
        const wz = cz * CHUNK_SIZE + j * GRASS_CELL + jz * GRASS_CELL;
        if (nearWater(wx, wz, 0.4)) continue; // трава мелкая — небольшой отступ
        if (blockedByStructure(wx, wz, 0.36, 0.17)) continue;
        const e = heightAt(wx, wz);
        // Трава заметна только ниже голых скалистых/снеговых верхов — было
        // 0.75 под старый синтетический потолок, пересчитано под настоящую
        // высоту (см. CONIFER_ELEVATION выше): альпийские луга в Карпатах
        // тянутся почти до линии снега, обрывать траву у подножия было бы
        // неправдой в другую сторону.
        if (e > 2.0) continue;
        const wy = e * HMAX;
        const yaw = hash2(gx, gz, SEED + 890) * Math.PI * 2;
        const jitter = 0.8 + hash2(gx, gz, SEED + 891) * 0.4;
        const base = GRASS_TONES[Math.floor(hash2(gx, gz, SEED + 892) * GRASS_TONES.length)];
        const s = 0.8 + hash2(gx, gz, SEED + 893) * 0.6;
        out.push({ x: wx, y: wy, z: wz, scale: [s, s, s], yaw, color: jitterColor(base, jitter), kind: "grass" });
      }
    }
    const bushCellsPerSide = CHUNK_SIZE / BUSH_CELL;
    for (let j = 0; j < bushCellsPerSide; j++) {
      for (let i = 0; i < bushCellsPerSide; i++) {
        const gx = cx * bushCellsPerSide + i, gz = cz * bushCellsPerSide + j;
        if (hash2(gx, gz, SEED + 997) >= BUSH_CHANCE) continue;
        const jx = hash2(gx, gz, SEED + 998), jz = hash2(gx, gz, SEED + 999);
        const wx = cx * CHUNK_SIZE + i * BUSH_CELL + jx * BUSH_CELL;
        const wz = cz * CHUNK_SIZE + j * BUSH_CELL + jz * BUSH_CELL;
        if (nearWater(wx, wz, 0.9)) continue;
        if (blockedByStructure(wx, wz, 0.44, 0.34)) continue;
        const e = heightAt(wx, wz);
        if (e > 2.0) continue; // см. комментарий у травы выше — тот же пересчёт под настоящую высоту
        const wy = e * HMAX;
        const yaw = hash2(gx, gz, SEED + 1000) * Math.PI * 2;
        const jitter = 0.85 + hash2(gx, gz, SEED + 1001) * 0.3;
        const base = BUSH_TONES[Math.floor(hash2(gx, gz, SEED + 1002) * BUSH_TONES.length)];
        const s = 0.9 + hash2(gx, gz, SEED + 1003) * 0.7;
        out.push({ x: wx, y: wy, z: wz, scale: [s, s, s], yaw, color: jitterColor(base, jitter), kind: "bush" });
      }
    }
    return out;
  }
  function refreshDecor() {
    const merged: DecorEntity[] = [];
    for (const list of decorByChunk.values()) merged.push(...list);
    renderer.setDecor(merged);
    (window as any).__decorCount = merged.length;
    (window as any).__decorList = merged; // отладка (см. test_decor_overlap.mjs)
  }

  // Стриминг чанков растянут по кадрам, а не построен одним синхронным
  // залпом: раньше первый заход в "Мир" вызывал updateTerrainChunks(force=
  // true) — 49 ближних чанков (сетка heightAt+нормали) плюс сразу следом
  // updateFarTerrain на 81 дальний — ВСЕ синхронно, одним тиком JS, ДО
  // первого кадра. Замер той же самой математики (см. bench в описании
  // коммита) — около 150-230мс сплошной блокировки основного потока на
  // десктопе, на телефоне заметно больше: то самое "подвисание при
  // открытии Мира", о котором сообщил пользователь. Постройка каждого
  // отдельного чанка сама по себе дёшева и не нуждается в переписывании —
  // проблема исключительно в том, что их все строили одним махом. Решение:
  // needed-чанки только СКЛАДЫВАЕМ в очередь (это дёшево — просто счёт
  // расстояний), а реальную стройку (buildTerrainPatch/декор) забирает
  // drainPendingNear ниже с бюджетом времени на кадр — тот же итоговый
  // набор чанков, просто размазанный по нескольким кадрам вместо одного.
  const CHUNK_BUDGET_MS = 6; // на кадр (near+far вместе, см. draw()) — не съедает весь кадр целиком
  const loadedChunks = new Set<string>();
  const queuedNearKeys = new Set<string>(); // зарезервированы под стройку, ещё не построены
  let pendingNear: Array<{ cx: number; cz: number; key: string }> = [];
  let lastCamChunkX: number | null = null;
  let lastCamChunkZ: number | null = null;
  function updateTerrainChunks(centerX: number, centerZ: number, force = false) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);
    // Дёшево: пересчитывать только при смене чанка камеры, не каждый кадр —
    // сама проверка (два сравнения) ничего не стоит, а полный проход по
    // радиусу загрузки/выгрузки экономится, пока камера гуляет внутри
    // одного и того же чанка.
    if (!force && ccx === lastCamChunkX && ccz === lastCamChunkZ) return;
    lastCamChunkX = ccx;
    lastCamChunkZ = ccz;
    let queueChanged = false;
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const key = chunkKey(cx, cz);
        if (loadedChunks.has(key) || queuedNearKeys.has(key)) continue;
        queuedNearKeys.add(key);
        pendingNear.push({ cx, cz, key });
        queueChanged = true;
      }
    }
    let decorChanged = false;
    for (const key of Array.from(loadedChunks)) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) > UNLOAD_RADIUS) {
        renderer.removeTerrainChunk(key);
        loadedChunks.delete(key);
        decorByChunk.delete(key);
        decorChanged = true;
      }
    }
    // Чанки, которые ещё только в очереди (камера успела уйти дальше, чем
    // drainPendingNear успел их построить) — отменяем стройку, а не строим
    // впустую то, что уже вышло за радиус выгрузки.
    for (const key of Array.from(queuedNearKeys)) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) > UNLOAD_RADIUS) {
        queuedNearKeys.delete(key);
        queueChanged = true;
      }
    }
    if (queueChanged) {
      pendingNear = pendingNear.filter((p) => queuedNearKeys.has(p.key));
      // Ближайшие к камере чанки — первыми: то, что прямо под игроком,
      // должно появиться раньше дальней кромки радиуса загрузки.
      pendingNear.sort((a, b) => {
        const da = (a.cx - ccx) ** 2 + (a.cz - ccz) ** 2;
        const db = (b.cx - ccx) ** 2 + (b.cz - ccz) ** 2;
        return da - db;
      });
    }
    (window as any).__terrainChunkCount = loadedChunks.size;
    if (decorChanged) refreshDecor();
  }
  // Строит чанки из очереди, пока не выйдет бюджет времени (deadline,
  // performance.now()) — вызывается из draw() каждый кадр, см. там же.
  function drainPendingNear(deadline: number): void {
    let decorChanged = false;
    while (pendingNear.length && performance.now() < deadline) {
      const { cx, cz, key } = pendingNear.shift()!;
      if (!queuedNearKeys.has(key)) continue; // отменено (см. updateTerrainChunks) — пропускаем
      queuedNearKeys.delete(key);
      const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
      const chunkMesh = buildTerrainPatch(x0, z0, x0 + CHUNK_SIZE, z0 + CHUNK_SIZE, 1);
      renderer.setTerrainChunk(key, chunkMesh);
      loadedChunks.add(key);
      notifyParentChunk(cx, cz);
      decorByChunk.set(key, genDecorForChunk(cx, cz));
      decorChanged = true;
    }
    if (decorChanged) {
      (window as any).__terrainChunkCount = loadedChunks.size;
      refreshDecor();
    }
  }

  // Пересборка меша УЖЕ загруженного ближнего чанка — нужна, когда новая
  // настоящая сущность (см. syncLiveEntities ниже) появляется в чанке,
  // рельеф которого был построен РАНЬШЕ, чем для неё зарегистрировали
  // площадку (registerFlattenSite, terrain.ts): без пересборки первая
  // сборка так и останется без учёта площадки до выгрузки/повторной
  // загрузки чанка (а игрок может не покидать область достаточно долго,
  // чтобы это случилось само).
  function rebuildTerrainChunkIfLoaded(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    if (!loadedChunks.has(key)) return;
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    renderer.setTerrainChunk(key, buildTerrainPatch(x0, z0, x0 + CHUNK_SIZE, z0 + CHUNK_SIZE, 1));
  }

  // ---- дальнее грубое кольцо рельефа — "задник", вроде extended backdrop
  // старого рендера (obyom-3d-infinite.html, "кольцо фона+тумана"): при
  // типичном наклоне камеры (pitch) луч в верхний край экрана бьёт в землю
  // на расстоянии, которое растёт вместе с dist (см. camera.ts) — уже при
  // дефолтном зуме это ~78 клеток от цели, вплотную к UNLOAD_RADIUS выше
  // (80), а при отдалении легко уходит за 150-200. Пришёл реальный
  // скриншот с телефона с гигантской чёрной пустотой у горизонта именно
  // из-за этого. Детальные чанки настолько далеко тянуть дорого (кубический
  // рост числа вершин), поэтому под ними — та же непрерывная heightAt(x,y),
  // просто гораздо реже посчитанная: издали разница в форме/цвете рельефа
  // не видна, а по вершинам дальний чанк размером FAR_CHUNK_SIZE с шагом
  // FAR_STEP стоит примерно как один обычный (FAR_CHUNK_SIZE/FAR_STEP —
  // столько же клеток на сторону, сколько и у ближнего чанка).
  // FAR_CHUNK_SIZE и FAR_UNLOAD_RADIUS объявлены раньше, у CHUNK_SIZE/
  // UNLOAD_RADIUS — их же значение нужно ENTITY_RADIUS ещё до этого блока.
  const FAR_STEP = 4;
  const FAR_LOAD_RADIUS = 5; // 5×64=320 клеток от камеры (было 4×64=256 — см. FAR_UNLOAD_RADIUS выше)
  // Грубая сетка и детальные ближние чанки читают ОДНУ И ТУ ЖЕ heightAt(x,y),
  // но в разных точках: между её редкими узлами грубая сетка линейно
  // интерполирует высоту, а не следует истинному рельефу, как частая сетка
  // ближних чанков — в зоне, где оба слоя лежат друг под другом, их высоты
  // почти, но не совсем совпадают, что даёт мерцание (z-fighting) на стыке.
  // Не грузим (и выгружаем, если уже успели) грубые чанки, чьи центры лежат
  // внутри зоны, ГАРАНТИРОВАННО покрытой детальным рельефом прямо сейчас —
  // именно LOAD_RADIUS (не более щедрый UNLOAD_RADIUS: тот лишь "может ещё
  // не успел выгрузиться", а не "точно загружен"). LOAD_RADIUS*CHUNK_SIZE —
  // гарантия только по КАРДИНАЛЬНЫМ направлениям (это радиус по Chebyshev,
  // квадрат, не круг) — здесь берём круговой радиус НЕ БОЛЬШЕ этого, чтобы
  // не оставить кольцевой зазор без рельефа вовсе (именно из-за такого
  // зазора и была чёрная пустота на скриншоте — не наступать на те же
  // грабли повторно с новым слоем). Небольшой нахлёст с ближними чанками в
  // буферной UNLOAD-зоне (48..80/113) — приемлемая цена, там ближний слой
  // почти всегда уже загружен и рисуется первым (см. порядок вставки в Map
  // в renderer.ts), так что визуально обычно не проваливается наружу.
  // ПРОРЕЗИ В МИРЕ. Раньше грубый чанк выбрасывался, если его ЦЕНТР ближе
  // NEAR_CLEAR_RADIUS (=LOAD_RADIUS*CHUNK_SIZE=48 клеток) к камере. Но грубый
  // чанк — квадрат в 64 клетки, он торчит на 32 клетки за собственный центр,
  // а детальное покрытие — не круг радиуса 48, а КВАДРАТ 7×7 ближних чанков.
  // Чанк с центром в 47 клетках выбрасывался целиком, вместе с той своей
  // частью, что уходила на 79 клеток — куда детальный слой уже не дотягивался.
  // Между границей ближнего квадрата и краем выброшенного грубого чанка
  // оставалась клиновидная дыра без рельефа вовсе: те самые «прорези в мире»,
  // о которых сообщил игрок (на скриншоте — серый клин у горизонта).
  // Теперь условие честное: выбрасываем грубый чанк, только если он ЦЕЛИКОМ
  // лежит внутри квадрата, гарантированно накрытого детальными чанками.
  // Границы сеток кратны (FAR_CHUNK_SIZE = 4×CHUNK_SIZE), так что попадание
  // проверяется точно, без запасов «на глаз».
  const FAR_SINK = 0.35;   // см. buildTerrainPatch(sink) — против мерцания в зоне нахлёста
  function farChunkFullyNear(cx: number, cz: number, centerX: number, centerZ: number): boolean {
    const ncx = Math.floor(centerX / CHUNK_SIZE), ncz = Math.floor(centerZ / CHUNK_SIZE);
    const minX = (ncx - LOAD_RADIUS) * CHUNK_SIZE, maxX = (ncx + LOAD_RADIUS + 1) * CHUNK_SIZE;
    const minZ = (ncz - LOAD_RADIUS) * CHUNK_SIZE, maxZ = (ncz + LOAD_RADIUS + 1) * CHUNK_SIZE;
    const x0 = cx * FAR_CHUNK_SIZE, z0 = cz * FAR_CHUNK_SIZE;
    return x0 >= minX && x0 + FAR_CHUNK_SIZE <= maxX && z0 >= minZ && z0 + FAR_CHUNK_SIZE <= maxZ;
  }
  const loadedFarChunks = new Set<string>();
  // Та же отложенная стройка, что и у ближних чанков выше (см. комментарий
  // там) — дальнее кольцо само по себе дешевле (грубая сетка), но на старте
  // строилось СРАЗУ ЖЕ следом за 49 ближними чанками, в той же самой
  // синхронной паузе, так что тоже переведено на очередь с бюджетом.
  const queuedFarKeys = new Set<string>();
  let pendingFar: Array<{ cx: number; cz: number; rkey: string }> = [];
  let lastFarChunkX: number | null = null;
  let lastFarChunkZ: number | null = null;
  function updateFarTerrain(centerX: number, centerZ: number, force = false) {
    const ccx = Math.floor(centerX / FAR_CHUNK_SIZE);
    const ccz = Math.floor(centerZ / FAR_CHUNK_SIZE);
    if (!force && ccx === lastFarChunkX && ccz === lastFarChunkZ) return;
    lastFarChunkX = ccx;
    lastFarChunkZ = ccz;
    let queueChanged = false;
    for (let dz = -FAR_LOAD_RADIUS; dz <= FAR_LOAD_RADIUS; dz++) {
      for (let dx = -FAR_LOAD_RADIUS; dx <= FAR_LOAD_RADIUS; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const rkey = "far:" + cx + "," + cz;
        if (loadedFarChunks.has(rkey) || queuedFarKeys.has(rkey)) continue;
        if (farChunkFullyNear(cx, cz, centerX, centerZ)) continue;
        queuedFarKeys.add(rkey);
        pendingFar.push({ cx, cz, rkey });
        queueChanged = true;
      }
    }
    for (const rkey of Array.from(loadedFarChunks)) {
      const [kx, kz] = rkey.slice(4).split(",").map(Number);
      const tooFar = Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) > FAR_UNLOAD_RADIUS;
      const tooClose = farChunkFullyNear(kx, kz, centerX, centerZ);
      if (tooFar || tooClose) {
        renderer.removeTerrainChunk(rkey);
        loadedFarChunks.delete(rkey);
      }
    }
    for (const rkey of Array.from(queuedFarKeys)) {
      const [kx, kz] = rkey.slice(4).split(",").map(Number);
      if (Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) > FAR_UNLOAD_RADIUS) {
        queuedFarKeys.delete(rkey);
        queueChanged = true;
      }
    }
    if (queueChanged) {
      pendingFar = pendingFar.filter((p) => queuedFarKeys.has(p.rkey));
      pendingFar.sort((a, b) => {
        const da = (a.cx - ccx) ** 2 + (a.cz - ccz) ** 2;
        const db = (b.cx - ccx) ** 2 + (b.cz - ccz) ** 2;
        return da - db;
      });
    }
    (window as any).__farChunkCount = loadedFarChunks.size;
  }
  function drainPendingFar(deadline: number): void {
    while (pendingFar.length && performance.now() < deadline) {
      const { cx, cz, rkey } = pendingFar.shift()!;
      if (!queuedFarKeys.has(rkey)) continue;
      queuedFarKeys.delete(rkey);
      const x0 = cx * FAR_CHUNK_SIZE, z0 = cz * FAR_CHUNK_SIZE;
      const mesh = buildTerrainPatch(x0, z0, x0 + FAR_CHUNK_SIZE, z0 + FAR_CHUNK_SIZE, FAR_STEP, FAR_SINK);
      renderer.setTerrainChunk(rkey, mesh);
      loadedFarChunks.add(rkey);
      // Дальнее кольцо — только видимость, не задел под дикий контент:
      // не зовём notifyParentChunk отсюда (в отличие от ближних чанков
      // выше) — иначе радиус в 256+ клеток мгновенно засыпал бы игрока
      // сгенерированным контентом во всех направлениях разом вместо
      // постепенного появления по мере реального исследования камерой.
    }
    (window as any).__farChunkCount = loadedFarChunks.size;
  }

  // ---- настоящие 3D-модели (те же .glb, что и в живой игре) для ВСЕХ
  // сущностей. Путь абсолютный от корня сайта: этот прототип живёт в
  // /engine/dist/, а модели — в /models/ у корня репозитория, который
  // Render отдаёт целиком как одну статику.
  //
  // Кэш по пути к файлу: с настоящей партией десятки лагерей/точек делят
  // одну и ту же модель (barbarians.glb на все лагеря/форты и т.п.) —
  // без кэша каждый инстанс заново качал бы и парсил тот же файл. Тот же
  // приём, что и modelCache в живом obyom-3d-infinite.html. Кэш живёт всё
  // время работы страницы, поэтому пригождается и при живой синхронизации
  // ниже — новая сущность с уже встречавшимся путём модели не грузит её
  // заново.
  //
  // Грузим и закачиваем всё в GPU ДО первого кадра цикла отрисовки, не
  // параллельно с ним: в тестах закачка текстуры ПОСЛЕ нескольких секунд
  // непрерывного рендера стабильно валила WebGPU-соединение именно в этой
  // песочнице ("A valid external Instance reference no longer exists") —
  // тот же вызов с тем же файлом отрабатывал без единой ошибки, если
  // делался до старта цикла. Не тратить GPU на рендер кадров, пока сцена
  // ещё не готова, — разумно само по себе, не только обход этой
  // особенности песочницы.
  const modelPipeline = createModelPipeline(device, format, renderer.getShadowResources());
  const modelCache = new Map<string, Promise<GpuModel>>();
  function getModel(path: string): Promise<GpuModel> {
    let p = modelCache.get(path);
    if (!p) {
      p = loadGLB(path).then((parsed) => uploadGLB(device, parsed));
      modelCache.set(path, p);
    }
    return p;
  }
  // Прогрев кэша ДО цикла инстансов: с настоящей партией уникальных путей
  // мало (десятки — расы×эпохи городов + по одному на лагерь/точки), но при
  // последовательном await внутри цикла первый инстанс каждого нового пути
  // блокирует все последующие сущности до своей полной загрузки — на 1433
  // сущностях (проверено синтетическим прогоном той же плотности, что и в
  // реальной партии) это стабильно давало ~4.8с до кадра. Запуск всех
  // уникальных путей ПАРАЛЛЕЛЬНО сокращает это до времени самой медленной
  // отдельной модели вместо суммы всех. Всё ещё строго до
  // requestAnimationFrame(draw) — см. комментарий выше про сбой
  // copyExternalImageToTexture при закачке параллельно с уже идущим циклом
  // рендера.
  const uniquePaths = new Set(Array.from(found, (eid) => modelPathOf.get(eid)!));
  await Promise.allSettled(Array.from(uniquePaths, (p) => getModel(p)));
  // Инстансы — по bitECS id, не плоский массив: живая синхронизация ниже
  // добавляет/убирает отдельные записи по мере появления/исчезновения
  // сущностей в партии, массив под это не годится (пришлось бы искать
  // индекс каждый раз).
  const instances = new Map<number, ModelInstance>();
  let loadedCount = 0, failedCount = 0;
  for (const eid of found) {
    const wx = Position.x[eid], wz = Position.y[eid];
    const groundY = heightAt(wx, wz) * HMAX;
    const mat = modelMatrix(wx, groundY, wz, 0, modelScaleOf.get(eid) ?? 5);
    const path = modelPathOf.get(eid)!;
    try {
      const gm = await getModel(path);
      instances.set(eid, modelPipeline.createInstance(gm, mat));
      loadedCount++;
    } catch (err) {
      failedCount++;
      lines.push(`модель: ошибка на ${path} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  lines.push(`модели: загружено ${loadedCount}/${found.length}${failedCount ? ", ошибок: " + failedCount : ""}`);
  setStatus(lines);
  (window as any).__ecsFound = found.length;
  (window as any).__foundPositions = () => found.map((eid) => ({ x: Position.x[eid], z: Position.y[eid], scale: modelScaleOf.get(eid) ?? 5 }));

  // ---- камера: с настоящими данными старт — у своего города (та же
  // логика, что уже прижилась в живой 3D-вкладке после жалобы "почему
  // камера стартует у 0:0, а не у моего города"), без данных — центр
  // демо-патча. Управляемая — перетаскивание вращает, колесо/щипок
  // масштабирует (см. camera.ts); пока не тронули экран — тихо продолжает
  // медленный автооблёт, чтобы страница не выглядела застывшей картинкой.
  const cx = ownPos ? ownPos.x : DEMO_CENTER.x;
  const cz = ownPos ? ownPos.y : DEMO_CENTER.y;
  const cy = heightAt(cx, cz) * HMAX;
  const cam: OrbitCamera = { yaw: 0, pitch: 0.55, dist: 42, target: [cx, cy + 2, cz] };
  const controls = attachOrbitControls(canvas, cam);
  // Первая загрузка чанков рельефа вокруг стартовой позиции камеры (force=
  // true, т.к. lastCamChunk* ещё не установлены) — теперь двухфазная, не
  // один синхронный залп. updateTerrainChunks/updateFarTerrain тут только
  // СКЛАДЫВАЮТ нужные чанки в очередь (дёшево, никакой стройки), а короткий
  // "прайминг"-дрейн ниже строит из неё то, что успевает за 40мс — обычно
  // хватает на несколько ближайших к камере чанков, чтобы под игроком сразу
  // была видна земля, а не голый туман. Остаток очереди (дальние кольца
  // радиуса загрузки, которые всё равно не видны в первый же кадр)
  // дотягивает drainPendingNear/drainPendingFar из draw() ниже, по budget'у
  // на кадр — тот же итоговый набор чанков, что и раньше, просто без одной
  // долгой блокирующей паузы перед первым кадром (была ~150-230мс на
  // одном только рельефе, замерено вне браузера — см. историю коммита).
  updateTerrainChunks(cam.target[0], cam.target[2], true);
  updateFarTerrain(cam.target[0], cam.target[2], true);
  const primeDeadline = performance.now() + 40;
  drainPendingNear(primeDeadline);
  drainPendingFar(primeDeadline);
  lines.push(`рельеф: чанков ${loadedChunks.size} (${CHUNK_SIZE}×${CHUNK_SIZE}) + дальних ${loadedFarChunks.size} (${FAR_CHUNK_SIZE}×${FAR_CHUNK_SIZE}, шаг ${FAR_STEP}), в очереди ещё ${pendingNear.length + pendingFar.length}`);
  setStatus(lines);
  // Отладочная проверка покрытия земли (тест на отсутствие "дыр" между
  // ближним и дальним слоем рельефа — тот самый баг со скриншота): любую
  // мировую точку можно проверить, лежит ли она внутри загруженного
  // ближнего ИЛИ дальнего чанка.
  (window as any).__coverageCheck = (x: number, z: number) => {
    for (const k of loadedChunks) {
      const [kx, kz] = k.split(",").map(Number);
      const x0 = kx * CHUNK_SIZE, z0 = kz * CHUNK_SIZE;
      if (x >= x0 && x < x0 + CHUNK_SIZE && z >= z0 && z < z0 + CHUNK_SIZE) return "near";
    }
    for (const k of loadedFarChunks) {
      const [kx, kz] = k.slice(4).split(",").map(Number);
      const x0 = kx * FAR_CHUNK_SIZE, z0 = kz * FAR_CHUNK_SIZE;
      if (x >= x0 && x < x0 + FAR_CHUNK_SIZE && z >= z0 && z < z0 + FAR_CHUNK_SIZE) return "far";
    }
    return null;
  };

  // ---- контракт для index.html: инструменты "+"/"−"/"к своему городу" и
  // клавиши +/-/h сейчас крутят СТАРЫЙ рендер через world3dWin() — читают
  // f.contentWindow.cam (поля tx/ty/tz/dist/pitch, не target-массив) и зовут
  // f.contentWindow.H(x,y) (мировая высота земли). Это тот самый контракт,
  // под который написан centerOn()/zoomAt() в index.html — они не знают и
  // не должны знать, какой рендер сейчас внутри iframe. Выставляем window.cam
  // прокси-объектом поверх настоящего cam (единый источник истины для
  // draw() ниже), а не отдельной копией — иначе рассинхронится. Любая правка
  // отсюда (тот же жест, что и ручной тап/колесо) останавливает автооблёт.
  Object.defineProperty(window, "cam", {
    value: {
      get tx() { return cam.target[0]; },
      set tx(v: number) { cam.target[0] = v; controls.stopAuto(); },
      get ty() { return cam.target[1]; },
      set ty(v: number) { cam.target[1] = v; controls.stopAuto(); },
      get tz() { return cam.target[2]; },
      set tz(v: number) { cam.target[2] = v; controls.stopAuto(); },
      get dist() { return cam.dist; },
      set dist(v: number) { cam.dist = v; controls.stopAuto(); },
      get pitch() { return cam.pitch; },
      set pitch(v: number) { cam.pitch = v; controls.stopAuto(); },
    },
  });
  (window as any).H = (x: number, y: number) => heightAt(x, y) * HMAX;
  (window as any).__camState = () => ({ yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, target: [...cam.target] });
  (window as any).__isAutoOrbiting = () => controls.isAutoOrbiting();

  // ---- координатная строка: в мире без края и без списка городов это
  // единственный способ и найти себя ("какие у меня координаты, чтобы
  // позвать друга"), и попасть в произвольную точку по чужим координатам.
  // Порт того же механизма из старого прототипа (obyom-3d-infinite.html,
  // см. коммит f04872e), включая обход одного и того же бага: пока поле
  // "живое" (каждый кадр показывает текущую позицию), таб с X на Y стирал
  // бы только что введённый X ещё до нажатия "Перейти" — coordDirty
  // останавливает перезапись сразу, как только начали печатать, и снимается
  // только после успешного перехода.
  const coordX = document.getElementById("coordX") as HTMLInputElement;
  const coordY = document.getElementById("coordY") as HTMLInputElement;
  const coordGo = document.getElementById("coordGo") as HTMLButtonElement;
  let coordDirty = false;
  for (const inp of [coordX, coordY]) inp.addEventListener("input", () => { coordDirty = true; });
  function goToCoords() {
    const x = parseFloat(coordX.value), y = parseFloat(coordY.value);
    if (!isFinite(x) || !isFinite(y)) return;
    // Тот же клэмп по границе мира, что и у ручной панорамы (camera.ts,
    // panTargetBy) — иначе игрок вводом координат обходил бы ограничение.
    cam.target[0] = Math.max(-WORLD_HALF_X, Math.min(WORLD_HALF_X, x));
    cam.target[2] = Math.max(-WORLD_HALF_Z, Math.min(WORLD_HALF_Z, y));
    cam.target[1] = heightAt(cam.target[0], cam.target[2]) * HMAX + 2;
    controls.stopAuto();
    coordDirty = false;
  }
  coordGo.addEventListener("click", goToCoords);
  for (const inp of [coordX, coordY]) inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); goToCoords(); inp.blur(); }
  });

  // ---- клик/тап по сущности: RoK-стиль (см. вживую уже реализованное
  // tryTap()+renderCartouche() в obyom-3d-infinite.html/index.html) — тут,
  // за неимением полноценной панели в изолированном прототипе, просто
  // подпись выбранной сущности (ник+ратуша/уровень — см. realData.ts) плюс
  // золотой пин-маркер над ней. Точечный проекционный тест по текущей VP
  // вместо честного рейкаста по мешу — сущностей может быть тысяча с лишним
  // (см. стресс-тест), гонять на каждый клик полный intersect с геометрией
  // моделей избыточно, а экранная дистанция до спроецированного центра
  // даёт тот же результат для выбора одной ближайшей метки.
  let currentVP: Mat4 = new Float32Array(16);
  // Позиция камеры текущего кадра — нужна отдельно от currentVP для
  // screenToGround (см. ниже): рейкаст в рельеф идёт от точки камеры вдоль
  // направления через тапнутый пиксель, обратная матрица VP тут не заведена
  // (нигде больше не нужна), проще держать eye и разложение на конус лучей
  // напрямую через те же fovy/aspect, что и persp() в draw().
  let currentEye: Vec3 = [0, 0, 0];
  const selectedEl = document.getElementById("selected") as HTMLDivElement;
  const HILITE_COLOR: [number, number, number] = [0.95, 0.78, 0.35];
  // Свой/чужой поход — тот же смысл, что и TINCT-золото/гранат в 2D-карте
  // index.html: не спутать наступающих с обороняющимися с одного взгляда.
  const OWN_MARCH_COLOR: [number, number, number] = [0.42, 0.78, 0.46];
  const ENEMY_MARCH_COLOR: [number, number, number] = [0.82, 0.24, 0.26];
  // Маркер подсветки выбора и маркеры походов (ниже) рисуются одним общим
  // instanced-вызовом renderer.setMarkers — держим его состав в одной
  // переменной, пересобираем и отдаём рендереру раз за кадр в draw(), а не
  // раздельными вызовами setMarkers из разных мест (переписывали бы друг
  // друга — сеттер заменяет весь список целиком, а не добавляет).
  let highlightMarker: MarkerEntity | null = null;
  let selectedEid: number | null = null;
  // Выбранный поход (id из W.marches, не bitECS eid — марши не заведены
  // как настоящие сущности, см. marchMarkers ниже) — отдельное состояние
  // от selectedEid, оба взаимно исключают друг друга (тап по одному сбрасывает
  // другое, см. controls.onTap). highlightMarker для похода пересчитывается
  // каждый кадр в draw() (см. lastMarches ниже), а не один раз при тапе —
  // поход движется, статичная подсветка тут же отстала бы от маркера.
  let selectedMarchId: number | null = null;
  // Режим слежения камеры за походом — отдельно от selectedMarchId
  // (выбор/подсветка марша тапом): index.html зовёт startFollowMarch() по
  // клику на ячейку "Отряды в поле" (см. renderFieldArmyWorld), камера
  // каждый кадр (см. draw()) подтягивает cam.target к текущей позиции
  // похода, "пока не прервёшь" — controls.onInteract ниже сбрасывает
  // followMarchId в момент первого же настоящего жеста пользователя
  // (палец/колесо/клавиша), тот же сигнал, что останавливает автооблёт.
  let followMarchId: number | null = null;
  (window as any).startFollowMarch = (marchId: number) => {
    // stopAuto() ПЕРВЫМ (глушит автооблёт) — он же зовёт onInteract ниже,
    // который сбрасывает followMarchId, так что назначать followMarchId
    // нужно СТРОГО ПОСЛЕ этого вызова, иначе слежение гасло бы в тот же
    // тик, что и включалось.
    controls.stopAuto();
    followMarchId = marchId;
  };
  controls.onInteract(() => {
    followMarchId = null;
  });
  function showSelection(eid: number) {
    selectedMarchId = null;
    selectedEid = eid;
    const label = (nmOf.get(eid) ?? "?") + " · " + (lvOf.get(eid) ?? "?");
    const wx = Position.x[eid], wz = Position.y[eid];
    const wy = heightAt(wx, wz) * HMAX + (modelScaleOf.get(eid) ?? 5) * 0.9 + 2;
    highlightMarker = { x: wx, y: wy, z: wz, color: HILITE_COLOR };
    (window as any).__markerActive = true;
    (window as any).__selectedLabel = label;
    selectedEl.textContent = label;
    selectedEl.style.display = "block";
  }
  function clearSelection() {
    selectedEid = null;
    highlightMarker = null;
    (window as any).__markerActive = false;
    (window as any).__selectedLabel = null;
    selectedEl.style.display = "none";
  }
  // ───────────────────────── Тач-пикинг: полностью переписан ─────────────────────────
  // Старая версия проецировала МИРОВЫЕ точки в ЭКРАННЫЕ (transformPoint через
  // currentVP) и сравнивала плоские пиксельные расстояния. У этого подхода
  // был скрытый численный баг: радиус хитбокса сущности оценивался, пробуя
  // спроецировать точку "край модели" (wx+scale) и меряя её экранное
  // расстояние от центра. Если эта пробная точка попадала БЛИЗКО к плоскости
  // камеры (clip.w около нуля, но выше порога отсечения 0.001), перспективное
  // деление (x/w) могло взорвать её экранные координаты до тысяч пикселей —
  // и тогда "радиус" сущности мог перекрыть весь экран целиком, из-за чего
  // тап ЛЮБОЙ точки канвы засчитывался этой сущности, даже впустую по земле
  // далеко от неё (живой репорт: тап по пустоши в центре экрана открыл
  // "Лесопилку" совсем в другом месте). Это не была случайность — эффект
  // зависит только от угла камеры в момент тапа, поэтому воспроизводился
  // стабильно на одном и том же экране.
  //
  // Новый подход — честный 3D-пикинг, БЕЗ повторной проекции экранных
  // координат вообще: один луч через тапнутый пиксель (тот же базис камеры,
  // что и раньше в screenToGround), и пересечение луча со СФЕРОЙ каждой
  // сущности/похода В МИРОВЫХ координатах (классическая формула
  // луч-сфера — квадратное уравнение, никакого деления на w, численно
  // устойчиво при любом угле камеры). Пороговый радиус сферы переводится из
  // "минимум N пикселей на экране" в мировые единицы через фокусное
  // расстояние камеры (см. FOCAL_PX) — тот же зрительный результат
  // (далёкие мелкие объекты остаются тактильно кликабельными), что и раньше,
  // но без хрупкой повторной проекции пробных точек.
  //
  // Окклюзия рельефом: раньше сущности/походы вообще не проверялись на
  // перекрытие горой/холмом — сфера "видна" сквозь любой рельеф. Теперь
  // рельеф — ТАКОЙ ЖЕ участник конкурса по параметру t (расстояние вдоль
  // луча до пересечения), что и сущности/походы: побеждает наименьшее t
  // среди всех кандидатов, значит ближайшее пересечение по лучу зрения
  // всегда выигрывает — то же самое "что ближе к камере, то и видно",
  // но теперь честно распространяется и на землю.
  function pixelRay(px: number, py: number): { origin: Vec3; dir: Vec3 } {
    const aspect = canvas.width / Math.max(1, canvas.height);
    const tanHalf = Math.tan(CAM_FOVY / 2);
    const ndcX = (px / canvas.width) * 2 - 1;
    const ndcY = 1 - (py / canvas.height) * 2;
    // Тот же базис камеры, что и в look() (mat4.ts): z — "назад" (от цели к
    // глазу), x/y — право/верх. Луч через пиксель — комбинация x/y по НОК,
    // минус z (вперёд, "в экран").
    const zAxis = norm(sub(currentEye, cam.target));
    const xAxis = norm(cross([0, 1, 0], zAxis));
    const yAxis = cross(zAxis, xAxis);
    const dir = norm([
      ndcX * aspect * tanHalf * xAxis[0] + ndcY * tanHalf * yAxis[0] - zAxis[0],
      ndcX * aspect * tanHalf * xAxis[1] + ndcY * tanHalf * yAxis[1] - zAxis[1],
      ndcX * aspect * tanHalf * xAxis[2] + ndcY * tanHalf * yAxis[2] - zAxis[2],
    ]);
    return { origin: currentEye, dir };
  }
  // Ближайшее пересечение луча (origin+dir*t, dir единичной длины) со сферой
  // (center, radius). null — мимо, либо сфера целиком позади камеры.
  function raySphereT(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | null {
    const ocx = origin[0] - center[0], ocy = origin[1] - center[1], ocz = origin[2] - center[2];
    const b = ocx * dir[0] + ocy * dir[1] + ocz * dir[2];
    const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
    const h = b * b - c;
    if (h < 0) return null; // луч мимо сферы
    const sh = Math.sqrt(h);
    let t = -b - sh;
    if (t < 0) t = -b + sh; // камера внутри сферы — берём точку выхода
    if (t < 0) return null; // сфера целиком позади камеры
    return t;
  }
  // Рельеф — процедурная heightfield-функция, не буфер треугольников под
  // рукой в это время, поэтому пересечение ищем марш-шагом вдоль луча до
  // heightAt(), затем бисекция на найденном отрезке для точности — тот же
  // общий приём, что и везде в этом проекте для heightfield-рейкастов.
  const CAM_FOVY = 0.72;
  // Запас над рельефом для eye (см. draw()) — не 0: даже вплотную к
  // поверхности ближняя плоскость (persp(...,0.5,...) — near=0.5) успевает
  // резать землю на неровностях в паре мировых единиц перед камерой.
  const EYE_GROUND_CLEARANCE = 2;
  const GROUND_RAY_STEP = 2, GROUND_RAY_MAX = 400, GROUND_RAY_BISECT_ITERS = 12;
  function groundRayT(origin: Vec3, dir: Vec3): { t: number; x: number; z: number } | null {
    let prevT = 0;
    for (let t = GROUND_RAY_STEP; t <= GROUND_RAY_MAX; t += GROUND_RAY_STEP) {
      const wx = origin[0] + dir[0] * t, wy = origin[1] + dir[1] * t, wz = origin[2] + dir[2] * t;
      if (wy - heightAt(wx, wz) * HMAX <= 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < GROUND_RAY_BISECT_ITERS; i++) {
          const mid = (lo + hi) / 2;
          const mx = origin[0] + dir[0] * mid, mz = origin[2] + dir[2] * mid;
          const my = origin[1] + dir[1] * mid;
          if (my - heightAt(mx, mz) * HMAX > 0) lo = mid; else hi = mid;
        }
        return { t: hi, x: origin[0] + dir[0] * hi, z: origin[2] + dir[2] * hi };
      }
      prevT = t;
    }
    return null;
  }
  // Если движок открыт внутри игры (тот же приём, что и readLiveWorld в
  // realData.ts), клик по сущности не просто подсвечивает её локально, но
  // и зовёт УЖЕ ГОТОВУЮ настоящую панель cartouche в index.html — ту же,
  // что открывает и старый 3D-рендер (obyom-3d-infinite.html). Она уже умеет
  // показывать профиль/атаку/разведку/поход, лежит поверх iframe по
  // z-index (см. комментарий у .plate в index.html) — переизобретать эти
  // кнопки внутри WebGPU-канвы не нужно.
  function notifyParentCartouche(gx: number, gy: number) {
    try {
      const w = window.parent;
      if (w && w !== window && typeof (w as any).renderCartoucheFor === "function") {
        (w as any).renderCartoucheFor(gx, gy);
      }
    } catch (_) {
      /* кросс-origin или не встроено — тихо игнорируем, локальная подпись уже показана */
    }
  }
  // Тот же мост, что и notifyParentCartouche, но для похода — марши не
  // клетка карты (id, не x/y), у index.html своя отдельная точка входа
  // renderMarchCartoucheFor(marchId) (см. index.html).
  function notifyParentMarchCartouche(marchId: number) {
    try {
      const w = window.parent;
      if (w && w !== window && typeof (w as any).renderMarchCartoucheFor === "function") {
        (w as any).renderMarchCartoucheFor(marchId);
      }
    } catch (_) {
      /* кросс-origin или не встроено */
    }
  }
  // Раньше тут был минимальный ЭКРАННЫЙ радиус хитбокса (46px, переводился в
  // мировые единицы через дистанцию камеры) — задумывался как страховка для
  // тактильного тапа по мелкой/далёкой модели. На практике он растёт линейно
  // с расстоянием БЕЗ верхнего предела: на обычном для нового (намного
  // большего) мира отдалении хитбокс раздувался в несколько мировых
  // клеток — автор сообщил именно это: тап в 6 клетках от замка/рудника всё
  // равно выбирал их, а не то, что под пальцем. Убрано целиком — радиус
  // хитбокса теперь равен именно масштабу модели (scale), без запаса и без
  // зависимости от дистанции камеры: как видно на экране, так и кликается.
  const MARCH_HIT_WORLD_RADIUS = 3;
  type TapHit =
    | { kind: "entity"; eid: number; t: number }
    | { kind: "march"; march: LiveMarchPos; t: number }
    | { kind: "ground"; x: number; z: number; t: number };
  function findTapTarget(px: number, py: number): TapHit | null {
    const { origin, dir } = pixelRay(px, py);
    let best: TapHit | null = null;
    let bestT = Infinity;
    for (const eid of found) {
      const wx = Position.x[eid], wz = Position.y[eid];
      const scale = modelScaleOf.get(eid) ?? 5;
      const center: Vec3 = [wx, heightAt(wx, wz) * HMAX + scale * 0.5, wz];
      const t = raySphereT(origin, dir, center, scale);
      if (t !== null && t < bestT) { bestT = t; best = { kind: "entity", eid, t }; }
    }
    for (const m of lastMarches) {
      const center: Vec3 = [m.x, heightAt(m.x, m.y) * HMAX + 2.2, m.y];
      const t = raySphereT(origin, dir, center, MARCH_HIT_WORLD_RADIUS);
      if (t !== null && t < bestT) { bestT = t; best = { kind: "march", march: m, t }; }
    }
    const ground = groundRayT(origin, dir);
    if (ground !== null && ground.t < bestT) {
      best = { kind: "ground", x: ground.x, z: ground.z, t: ground.t };
      bestT = ground.t;
    }
    return best;
  }
  // Тап определяет camera.ts (короткое почти-неподвижное касание, тот же
  // приём, что и tryTap()/lift() в прошлом прототипе) — не родной "click":
  // теперь, когда один палец панорамирует камеру (см. camera.ts), родной
  // click не всегда надёжно отличает "тап по сущности" от "только что
  // случившейся панорамы тем же пальцем".
  controls.onTap((clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const hit = findTapTarget(px, py);
    if (hit?.kind === "entity") {
      showSelection(hit.eid);
      const g = gridOf.get(hit.eid);
      if (g) notifyParentCartouche(g.x, g.y);
      return;
    }
    if (hit?.kind === "march") {
      clearSelection();
      selectedMarchId = hit.march.id;
      (window as any).__selectedMarchId = hit.march.id;
      notifyParentMarchCartouche(hit.march.id);
      return;
    }
    clearSelection();
    selectedMarchId = null;
    // Ни сущность, ни поход, ни рельеф под лучом — тап ушёл в небо (за
    // пределы GROUND_RAY_MAX) либо сразу за границу карты. Ничего не
    // открываем — старый код в этом случае тоже показывал бы мусор
    // (screenToGround(...) === null тут раньше просто ничего не делал).
    if (hit?.kind === "ground") notifyParentCartouche(Math.floor(hit.x), Math.floor(hit.z));
  });

  // ---- живая синхронизация: партия внутри игры не стоит на месте —
  // ресурсные точки истощаются и появляются заново в другом месте, лагеря
  // разбиты, города растут (уровень ратуши меняет и подпись, и саму
  // модель — эпоха замка). Однократного чтения window.parent.W при
  // загрузке недостаточно, если движок когда-нибудь встанет на место
  // живой 3D-вкладки. Опрос по таймеру, не по кадру — 60 раз в секунду
  // пересчитывать разницу по тысяче с лишним записей незачем, партия не
  // меняется настолько быстро.
  const SYNC_INTERVAL_MS = 3000;
  let syncCount = 0;
  async function syncLiveEntities() {
    // Центр отбора — ТЕКУЩАЯ позиция камеры, не стартовая: по мере того как
    // игрок панорамирует (см. camera.ts), в зону отбора естественно входят
    // новые сущности и выходят старые — тот же диф ниже (seenKeys/keyToEid)
    // обрабатывает оба случая одинаково, отдельной логики "вышло из вида"
    // не потребовалось.
    const fresh = loadRealEntities(cam.target[0], cam.target[2], ENTITY_RADIUS);
    if (!fresh) return; // связь с window.parent.W пропала — оставляем сцену как есть
    const seenKeys = new Set<string>();
    const pendingLoads: Promise<void>[] = [];
    // Чанки декора, которые нужно пересчитать после этого дифа: decorByChunk
    // кэшируется один раз при загрузке чанка (см. genDecorForChunk) и сам по
    // себе не знает, что реальная сущность рядом с этим декором появилась
    // или исчезла. Разгромленный лагерь/истощившаяся точка/перенесённый
    // город должны освобождать место под траву и деревья на своём месте —
    // тот же приём, что и в старом прототипе (обратный процесс, порождение
    // новой структуры, тоже нужен: иначе трава могла бы прорасти прямо под
    // только что появившимся зданием, пока чанк не перезагрузится).
    const decorDirtyChunks = new Set<string>();
    for (const e of fresh) {
      seenKeys.add(e.key);
      const existingEid = keyToEid.get(e.key);
      if (existingEid !== undefined) {
        nmOf.set(existingEid, e.nm);
        lvOf.set(existingEid, e.lv);
        ownOf.set(existingEid, !!e.own);
        if (selectedEid === existingEid) showSelection(existingEid); // подпись/маркер могли устареть (level up)
        if (modelPathOf.get(existingEid) !== e.model) {
          // город вырос до новой эпохи и т.п. — модель меняется, позиция нет
          modelPathOf.set(existingEid, e.model);
          modelScaleOf.set(existingEid, e.scale);
          const wx = Position.x[existingEid], wz = Position.y[existingEid];
          const groundY = heightAt(wx, wz) * HMAX;
          const mat = modelMatrix(wx, groundY, wz, 0, e.scale);
          pendingLoads.push(
            getModel(e.model)
              .then((gm) => void instances.set(existingEid, modelPipeline.createInstance(gm, mat)))
              .catch(() => {})
          );
        }
        continue;
      }
      // новая сущность — появилась с прошлого опроса
      const eid = spawnEntity(e);
      const groundY = heightAt(e.x, e.y) * HMAX;
      const mat = modelMatrix(e.x, groundY, e.y, 0, e.scale);
      pendingLoads.push(
        getModel(e.model)
          .then((gm) => void instances.set(eid, modelPipeline.createInstance(gm, mat)))
          .catch(() => {})
      );
      decorDirtyChunks.add(chunkKey(Math.floor(e.x / CHUNK_SIZE), Math.floor(e.y / CHUNK_SIZE)));
      // spawnEntity уже зарегистрировал площадку под эту сущность (см.
      // выше), но если её чанк рельефа был собран РАНЬШЕ (площадки тогда
      // ещё не было) — меш нужно пересобрать, иначе площадка появится
      // только для декора/heightAt-запросов, а сам рельеф под моделью
      // так и останется старым, неровным.
      rebuildTerrainChunkIfLoaded(Math.floor(e.x / CHUNK_SIZE), Math.floor(e.y / CHUNK_SIZE));
    }
    for (const [key, eid] of Array.from(keyToEid)) {
      if (seenKeys.has(key)) continue;
      decorDirtyChunks.add(chunkKey(Math.floor(Position.x[eid] / CHUNK_SIZE), Math.floor(Position.y[eid] / CHUNK_SIZE)));
      removeEntity(world, eid);
      instances.delete(eid);
      modelPathOf.delete(eid);
      modelScaleOf.delete(eid);
      nmOf.delete(eid);
      lvOf.delete(eid);
      ownOf.delete(eid);
      gridOf.delete(eid);
      keyToEid.delete(key);
      if (selectedEid === eid) clearSelection();
    }
    await Promise.allSettled(pendingLoads);
    found = Array.from(query(world, [Position, Kind]));
    // found теперь отражает диф целиком (новые сущности вошли, исчезнувшие
    // вышли) — только сейчас можно безопасно пересчитать декор задетых
    // чанков: genDecorForChunk/blockedByStructure читают found по
    // замыканию, пересчитай их раньше — decor всё ещё сверялся бы со
    // старым составом сущностей.
    let decorTouched = false;
    for (const dk of decorDirtyChunks) {
      if (!loadedChunks.has(dk)) continue; // чанк вне радиуса прогрузки — нечего пересчитывать
      const [dcx, dcz] = dk.split(",").map(Number);
      decorByChunk.set(dk, genDecorForChunk(dcx, dcz));
      decorTouched = true;
    }
    if (decorTouched) refreshDecor();
    syncCount++;
    (window as any).__ecsFound = found.length;
    (window as any).__syncCount = syncCount;
  }
  if (usingReal) {
    setInterval(() => {
      // Во вкладке "Город" 3D не видно — полный обход сущностей и подгрузка
      // моделей здесь ни к чему. При возврате всё равно синхронизируемся: в
      // "Мире" интервал снова начинает срабатывать, а пропущенные появления
      // и исчезновения — это дискретные события, они подтянутся одним махом.
      if (isHidden()) return;
      syncLiveEntities().catch((err) => console.error("live sync:", err));
    }, SYNC_INTERVAL_MS);
  }

  // ---- походы (W.marches): в отличие от городов/лагерей/точек, положение
  // похода не событие, а непрерывное движение по пути — читаем и
  // пересчитываем КАЖДЫЙ КАДР напрямую из window.parent.W (не через
  // 3-секундный syncLiveEntities, тот для дискретных появлений/исчезновений
  // сущностей), см. marchData.ts — дословный порт pathPointAt/marchPos.
  // Своей .glb-модели у похода нет — тот же пин-маркер-пирамидка, что и у
  // подсветки выбора, просто сразу несколько штук за раз в одном
  // instanced-вызове.
  // lastMarches — тот же список, что и последний возврат marchMarkers(),
  // но НЕ сведённый до голых MarkerEntity: findMarchAtScreen (тап) и
  // draw() (подсветка выбранного похода, см. selectedMarchId) нужны id/
  // владелец/состояние, которых у MarkerEntity нет.
  let lastMarches: LiveMarchPos[] = [];
  function marchMarkers(): MarkerEntity[] {
    if (!usingReal) { lastMarches = []; return []; }
    const marches = loadLiveMarches();
    if (!marches) { lastMarches = []; return []; }
    lastMarches = marches;
    (window as any).__marchPositions = marches;
    return marches.map((m) => ({
      x: m.x,
      y: heightAt(m.x, m.y) * HMAX + 2.2,
      z: m.y,
      color: m.own ? OWN_MARCH_COLOR : ENEMY_MARCH_COLOR,
    }));
  }

  // ---- ambient-подписи над замками/лагерями/точками (RoK-стиль) — тот же
  // приём, что и updateLabels()/projectToScreen() в obyom-3d-infinite.html:
  // обычные DOM-узлы поверх канвы, transform пересчитывается каждый кадр
  // по проекции 3D-точки (currentVP уже считается для клика — переиспользуем
  // ту же матрицу, не отдельную). WebGPU сюда текст без собственной системы
  // растеризации шрифта не положит — держать подписи в DOM надёжнее и
  // дешевле, чем текстуры с текстом. Пул divов переиспускается по id —
  // не пересоздаём на каждый кадр, только двигаем/показываем/прячем то, что
  // уже есть.
  const labelsRoot = document.getElementById("labels") as HTMLDivElement;
  interface LabelParts { root: HTMLDivElement; nm: HTMLElement; lv: HTMLElement }
  const labelEl = new Map<number, LabelParts>();
  // Отсев по расстоянию до цели камеры ДО проекции — сущностей может быть
  // тысяча с лишним (см. стресс-тест на 1433), а разборчиво видна на экране
  // всегда лишь горстка рядом с камерой. Первая попытка (радиус 90) была
  // слишком щедрой — почти вся карта 100×100 укладывалась в неё разом, и
  // цикл создания/обновления DOM-узлов на каждый кадр валил кадровую
  // частоту с 60 до ~14 (см. стресс-тест). 32 клетки — уже сравнимо с самой
  // дистанцией камеры (cam.dist по умолчанию ~40), т.е. реально видимая
  // площадка, а не весь остров.
  const LABEL_MAX_DIST2 = 32 * 32;
  function updateAmbientLabels() {
    const seen = new Set<number>();
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    for (const eid of found) {
      const wx = Position.x[eid], wz = Position.y[eid];
      const dx = wx - cam.target[0], dz = wz - cam.target[2];
      if (dx * dx + dz * dz > LABEL_MAX_DIST2) continue;
      const groundY = heightAt(wx, wz) * HMAX;
      const scale = modelScaleOf.get(eid) ?? 5;
      const topY = groundY + scale * 0.6 + 1.1;
      const clip = transformPoint(currentVP, [wx, topY, wz]);
      if (clip.w <= 0.001) continue; // за спиной камеры
      const sx = (clip.x / clip.w * 0.5 + 0.5) * cw;
      const sy = (1 - (clip.y / clip.w * 0.5 + 0.5)) * ch;
      if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
      seen.add(eid);
      let parts = labelEl.get(eid);
      if (!parts) {
        const root = document.createElement("div");
        root.className = "wlabel";
        const nm = document.createElement("div");
        nm.className = "nm";
        const lv = document.createElement("div");
        lv.className = "lv";
        root.appendChild(nm);
        root.appendChild(lv);
        labelsRoot.appendChild(root);
        parts = { root, nm, lv };
        labelEl.set(eid, parts);
      }
      parts.nm.textContent = nmOf.get(eid) ?? "?";
      parts.nm.classList.toggle("mine", !!ownOf.get(eid));
      parts.lv.textContent = lvOf.get(eid) ?? "";
      parts.root.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const [eid, parts] of labelEl) {
      if (!seen.has(eid)) {
        parts.root.remove();
        labelEl.delete(eid);
      }
    }
  }

  // Фаза 27 — метка боя над маршем в state:"siege" ("Развёртывание"/
  // "Бой — раунд N"/"Отступление" + две мини-полоски HP), видна ЛЮБОМУ
  // игроку — не только сторонам боя (см. mpRefreshWorldBattles/
  // mpWorldSnapshot в index.html: marches_select_all уже открыт всем,
  // раньше этим просто никто не пользовался). Тот же приём проекции и тот
  // же пул DOM-узлов, что и у updateAmbientLabels выше (переиспользуем
  // currentVP/found не при чём — тут источник lastMarches, не bitECS
  // сущности), только своя вёрстка (.blabel, не .wlabel) и отсев не по
  // bitECS eid, а по march id.
  interface BattleLabelParts { root: HTMLDivElement; title: HTMLElement; atkFill: HTMLElement; defFill: HTMLElement }
  const battleLabelEl = new Map<number, BattleLabelParts>();
  // battleInterp — дословный порт mpBattleInterp(index.html): доводка от
  // revealFrom* к текущему значению по времени между revealStart/revealAt,
  // сервер уже прислал оба конца интервала, гадать клиенту нечего.
  function battleInterp(from: number, to: number, revealStart: number, revealAt: number): number {
    if (!revealAt || !revealStart || revealAt <= revealStart) return to;
    const frac = Math.max(0, Math.min(1, (Date.now() - revealStart) / (revealAt - revealStart)));
    return from + (to - from) * frac;
  }
  function updateBattleLabels() {
    const seen = new Set<number>();
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    for (const m of lastMarches) {
      const b = m.battle;
      if (!b) continue;
      const dx = m.x - cam.target[0], dz = m.y - cam.target[2];
      if (dx * dx + dz * dz > LABEL_MAX_DIST2) continue;
      // +2.2 — та же высота маркера похода, что и в marchMarkers() выше;
      // +1.6 сверху — чтобы подпись плавала НАД самим маркером-точкой, не
      // перекрывая его.
      const topY = heightAt(m.x, m.y) * HMAX + 2.2 + 1.6;
      const clip = transformPoint(currentVP, [m.x, topY, m.y]);
      if (clip.w <= 0.001) continue;
      const sx = (clip.x / clip.w * 0.5 + 0.5) * cw;
      const sy = (1 - (clip.y / clip.w * 0.5 + 0.5)) * ch;
      if (sx < -60 || sx > cw + 60 || sy < -60 || sy > ch + 60) continue;
      seen.add(m.id);
      let parts = battleLabelEl.get(m.id);
      if (!parts) {
        const root = document.createElement("div");
        root.className = "blabel";
        const title = document.createElement("div");
        title.className = "btitle";
        const atkBar = document.createElement("div");
        atkBar.className = "bbar atk";
        const atkFill = document.createElement("i");
        atkBar.appendChild(atkFill);
        const defBar = document.createElement("div");
        defBar.className = "bbar def";
        const defFill = document.createElement("i");
        defBar.appendChild(defFill);
        root.appendChild(title);
        root.appendChild(atkBar);
        root.appendChild(defBar);
        labelsRoot.appendChild(root);
        parts = { root, title, atkFill, defFill };
        battleLabelEl.set(m.id, parts);
      }
      const retreating = b.retreating;
      const deploying = !retreating && b.revealFromRound === 0;
      parts.root.className = "blabel" + (retreating ? " retreat" : deploying ? " deploy" : "");
      parts.title.textContent = retreating ? "Отступление" : deploying ? "Развёртывание" : "Бой — раунд " + b.round;
      const attPct = Math.max(0, Math.min(100, battleInterp(b.revealFromAttHp, b.attHpLeft, b.revealStart, b.revealAt) / Math.max(1, b.attStartHp) * 100));
      const defPct = Math.max(0, Math.min(100, battleInterp(b.revealFromDefHp, b.defHpLeft, b.revealStart, b.revealAt) / Math.max(1, b.defStartHp) * 100));
      parts.atkFill.style.width = attPct.toFixed(1) + "%";
      parts.defFill.style.width = defPct.toFixed(1) + "%";
      parts.root.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const [id, parts] of battleLabelEl) {
      if (!seen.has(id)) {
        parts.root.remove();
        battleLabelEl.delete(id);
      }
    }
  }

  function draw(tMs: number) {
    // Пока открыт "Город", 3D целиком скрыт — рисовать нечего и некуда.
    // Раньше цикл продолжал крутиться и молотить в схлопнутую канву: лишний
    // GPU-проход, перепроецирование подписей и пересчёт позиций походов
    // КАЖДЫЙ кадр за спиной у игрока, который смотрит совсем на другой экран.
    // Просто пропускаем кадр — состояние камеры и сущностей не трогаем, так
    // что возврат во вкладку продолжает ровно с того же места.
    if (isHidden()) { requestAnimationFrame(draw); return; }
    if (controls.isAutoOrbiting()) cam.yaw = tMs * 0.00015;
    controls.update(tMs); // WASD/стрелки — панорама, зажатая клавиша даёт непрерывный сдвиг между кадрами
    // marchMarkers() тут же (не ниже, как раньше) — followMarchId должен
    // подтянуть cam.target к СВЕЖЕЙ позиции похода ДО того, как из
    // cam.target посчитается eye/vp этого же кадра, иначе слежение
    // отставало бы на кадр. lastMarches, который marchMarkers() заполняет
    // попутно, переиспользуется ниже вместо второго вызова.
    const markers = marchMarkers();
    if (followMarchId !== null) {
      const followed = lastMarches.find((m) => m.id === followMarchId);
      if (followed) {
        cam.target[0] = followed.x;
        cam.target[2] = followed.y;
        cam.target[1] = heightAt(followed.x, followed.y) * HMAX + 1;
      } else {
        followMarchId = null; // поход прибыл/был отозван, пока за ним следили — слежению больше нечего показывать
      }
    }
    if (!coordDirty) {
      coordX.value = cam.target[0].toFixed(1);
      coordY.value = cam.target[2].toFixed(1);
    }
    updateTerrainChunks(cam.target[0], cam.target[2]); // no-op, пока камера внутри того же чанка — дёшево звать каждый кадр
    updateFarTerrain(cam.target[0], cam.target[2]); // то же самое, но для дальнего грубого кольца
    // Стройка чанков из очереди (см. pendingNear/pendingFar выше) — общий
    // бюджет на near+far вместе, near в приоритете (первым забирает своё
    // время из бюджета), т.к. он ближе к камере и заметнее дальнего кольца.
    const chunkDeadline = performance.now() + CHUNK_BUDGET_MS;
    drainPendingNear(chunkDeadline);
    drainPendingFar(chunkDeadline);
    const eye: Vec3 = [
      cam.target[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target[1] + Math.sin(cam.pitch) * cam.dist,
      cam.target[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    ];
    // Автор: «камера не вылетала в горы или землю». cam.target сам подтянут
    // к рельефу (см. panTargetBy/jumpToMarchFor и т.п.), но eye — чисто
    // геометрическое смещение от target по yaw/pitch/dist, ничем не
    // проверенное: если между целью и камерой оказывается гора выше самой
    // камеры (низкий pitch у подножия хребта, или орбита заводит камеру за
    // склон), eye оказывается ПОД поверхностью рельефа в своей же точке —
    // камера "внутри" горы, ближняя плоскость режет её изнутри. Раз рельеф
    // — высотная карта без нависаний, достаточно подпереть eye по вертикали
    // высотой рельефа в точке (eye[0], eye[2]) — не трогая yaw/pitch/dist,
    // которыми управляет игрок, только фактическое положение над землёй.
    const eyeFloor = heightAt(eye[0], eye[2]) * HMAX + EYE_GROUND_CLEARANCE;
    if (eye[1] < eyeFloor) eye[1] = eyeFloor;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const vp = mul(persp(CAM_FOVY, aspect, 0.5, 300), look(eye, cam.target, [0, 1, 0]));
    currentVP = vp;
    currentEye = eye;
    renderer.setVP(vp);
    renderer.setFog(eye, FOG_COLOR, FOG_K, tMs / 1000);
    renderer.setSunTarget(cam.target[0], cam.target[2]);
    // Тот же базис камеры, что и pixelRay() ниже (см. её комментарий) —
    // небо (renderer.ts, SKY_SHADER) реконструирует луч обзора по пикселю
    // теми же формулами, что уже безопасно используются для клика по
    // сущности.
    {
      const zAxis = norm(sub(eye, cam.target));
      const xAxis = norm(cross([0, 1, 0], zAxis));
      const yAxis = cross(zAxis, xAxis);
      renderer.setSkyCamera(xAxis, yAxis, zAxis, Math.tan(CAM_FOVY / 2), aspect, tMs / 1000);
    }
    modelPipeline.setFog(eye, FOG_COLOR, FOG_K);
    // Выбранный поход движется — в отличие от showSelection() для
    // статичных сущностей (город/лагерь/точка), тут нельзя один раз
    // посчитать highlightMarker при тапе, он бы тут же отстал от
    // маркера. Пересчитываем из lastMarches (уже обновлён вызовом
    // marchMarkers() строкой выше) каждый кадр.
    if (selectedMarchId !== null) {
      const sel = lastMarches.find((m) => m.id === selectedMarchId);
      if (sel) {
        highlightMarker = { x: sel.x, y: heightAt(sel.x, sel.y) * HMAX + 3.2, z: sel.y, color: HILITE_COLOR };
      } else {
        selectedMarchId = null; // поход прибыл/был отозван — подсветке больше нечего показывать
        highlightMarker = null;
      }
    }
    if (highlightMarker) markers.push(highlightMarker);
    renderer.setMarkers(markers);
    (window as any).__marchCount = markers.length - (highlightMarker ? 1 : 0);
    renderer.frame({ r: FOG_COLOR[0], g: FOG_COLOR[1], b: FOG_COLOR[2], a: 1 }, (pass) => {
      for (const eid of found) {
        const inst = instances.get(eid);
        if (inst) modelPipeline.draw(pass, inst, vp);
      }
    });
    updateAmbientLabels();
    updateBattleLabels();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  (window as any).__engineReady = true;
}

main().catch((err) => {
  setErrorStatus([`Ошибка: ${err instanceof Error ? err.message : String(err)}`]);
  console.error(err);
});
