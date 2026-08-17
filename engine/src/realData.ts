/* =========================================================================
   Настоящие данные партии вместо четырёх придуманных сущностей демо —
   тот же приём, что и в realDataSource()/rebuildRealIndex() из
   obyom-3d-infinite.html: если движок открыт ВНУТРИ игры (в iframe или
   как встраиваемый модуль, window.parent!==window), читаем window.parent.W
   напрямую (тот же origin, гонять postMessage-протокол между настолько
   связанными частями смысла нет). Если данных нет — этот файл сам по себе
   ничего не решает, main.ts откатится на демо-сущности; ничего в живой
   игре этот модуль не трогает и не требует.
   ========================================================================= */

export interface RealEntity {
  key: string; // ключ клетки карты ("x,y" — тот же, что и W.map) — стабильный id для живой синхронизации в main.ts
  x: number; // мировая координата рендера (клетка + 0.5 — см. ниже)
  y: number;
  gx: number; // целая клетка карты (как W.map[key].x) — для вызова window.parent.renderCartoucheFor(gx,gy)
  gy: number;
  kind: 0 | 1 | 2; // 0=город 1=лагерь/форт 2=точка ресурсов
  model: string;
  scale: number;
  own?: boolean; // столица игрока (W.players[0]) — та же договорённость, что и в остальной игре
  // Подпись в две части — ник/тип и уровень, тот же состав, что и
  // labelContent() в obyom-3d-infinite.html: ambient-подписи над моделями
  // (см. main.ts) показывают их отдельными строками, как и раньше; клик
  // по сущности склеивает их через " · " для панели выбора.
  nm: string;
  lv: string;
}

const REAL_RES_MAP: Record<string, string> = { food: "farm", wood: "sawmill", stone: "quarry", gold: "gold-mine", amber: "amber-vein" };
// Те же подписи типов точек, что и RES_SITE_NAME в index.html (cartouche).
const RES_SITE_NAME: Record<string, string> = { food: "Пашня", wood: "Лесопилка", stone: "Каменоломня", gold: "Рудник", amber: "Янтарная жила" };
// Дословно epochOf из index.html — своей копии эпох тут нет, но эта чистая
// функция от одного числа (уровня ратуши) достаточно стабильна, чтобы не
// тянуть её через window.parent лишним мостом.
function epochOf(hall: number): number {
  return hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1;
}

interface LiveWorld {
  map: Record<string, any>;
  // Индекс W.map по чанку 16×16 ("cx,cy" -> [ключи W.map]) — тот же, что и
  // ensureChunkContent/mapSet/mapDelete поддерживают в index.html (см. Фазу
  // 4 плана бесконечного мира). Опционален только на партиях, которые ещё
  // не прошли через load()/genWorld() с этим индексом (переходный момент);
  // loadRealEntities ниже сама откатывается на полный перебор, если его нет.
  mapChunks?: Record<string, string[]>;
  players: Array<{ id: number; race: string; nick?: string; x: number; y: number; b: { hall: number } }>;
}

function readLiveWorld(): LiveWorld | null {
  try {
    const w = window.parent;
    if (w && w !== window && (w as any).W) return (w as any).W as LiveWorld;
  } catch (_) {
    /* кросс-origin — считаем, что настоящих данных нет */
  }
  return null;
}

// Позиция своего города — читается напрямую из W.players[0].x/y, в обход
// W.map/loadRealEntities целиком. Нужна ДО того, как известен центр для
// чанкового отбора сущностей (см. loadRealEntities ниже) — иначе курица и
// яйцо: чтобы найти свой город перебором W.map, нужен уже готовый центр
// отбора, а сам город и должен стать этим центром при самой первой загрузке
// (см. main.ts — камера стартует именно тут).
export function getOwnCityPos(): { x: number; y: number } | null {
  const W = readLiveWorld();
  if (!W || !W.players[0]) return null;
  return { x: W.players[0].x, y: W.players[0].y };
}

// Тот же размер чанка, что и STRUCT_CHUNK в index.html — единое
// пространство координат чанков что для игровой генерации дикого контента,
// что для отбора сущностей на рендер здесь: обе стороны должны совпадать,
// чтобы читать готовый W.mapChunks напрямую, а не пересчитывать его заново.
const CHUNK_SIZE = 16;

// centerX/centerZ/radius — то же, что и W.mapChunks/findNear в index.html:
// при настоящей партии сущностей может быть сколько угодно по мере
// исследования бесконечного мира (см. Фазу 4), полный перебор W.map на
// каждую загрузку/3-секундный опрос (см. main.ts) больше не годится.
// Опущены (или партия ещё без W.mapChunks) — честный полный перебор, как
// было раньше; так же ведёт себя и demo-режим (там W вообще нет).
export function loadRealEntities(centerX?: number, centerZ?: number, radius?: number): RealEntity[] | null {
  const W = readLiveWorld();
  if (!W) return null;
  const out: RealEntity[] = [];
  const scoped = centerX !== undefined && centerZ !== undefined && radius !== undefined && !!W.mapChunks;
  const keys: string[] = [];
  if (scoped) {
    const c0x = Math.floor((centerX! - radius!) / CHUNK_SIZE), c1x = Math.floor((centerX! + radius!) / CHUNK_SIZE);
    const c0y = Math.floor((centerZ! - radius!) / CHUNK_SIZE), c1y = Math.floor((centerZ! + radius!) / CHUNK_SIZE);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = W.mapChunks![cx + "," + cy];
        if (arr) for (const k of arr) keys.push(k);
      }
    }
  } else {
    for (const k in W.map) keys.push(k);
  }
  const r2 = radius !== undefined ? radius * radius : Infinity;
  for (const key of keys) {
    const o = W.map[key];
    if (!o) continue;
    if (scoped) {
      const dx = o.x - centerX!, dz = o.y - centerZ!;
      if (dx * dx + dz * dz > r2) continue;
    }
    if (o.t === "city") {
      const pl = W.players.find((p) => p.id === o.pid);
      const race = pl ? pl.race : "human";
      const epoch = pl ? Math.max(1, Math.min(5, epochOf(pl.b.hall))) : 1;
      const own = W.players[0] && pl && pl.id === W.players[0].id;
      const nm = pl ? pl.nick ?? "?" : "?";
      const lv = pl ? "Ратуша " + pl.b.hall : "";
      out.push({ key, x: o.x + 0.5, y: o.y + 0.5, gx: o.x, gy: o.y, kind: 0, model: `/models/castles/${race}-${epoch}.glb`, scale: 10, own, nm, lv });
    } else if (o.t === "camp" || o.t === "fort") {
      const nm = (o.t === "fort" ? "Форт" : "Лагерь") + " варваров";
      // Уровень убран из cartouche (детальной панели по тапу), но НЕ
      // отсюда — плавающая подпись прямо на карте остаётся с уровнем: без
      // него издалека не видно, какой лагерь/точка сильнее, приходится
      // тапать каждый по очереди (пользователь явно попросил вернуть).
      const lv = "ур. " + (o.lv ?? "?");
      out.push({ key, x: o.x + 0.5, y: o.y + 0.5, gx: o.x, gy: o.y, kind: 1, model: "/models/camps/barbarians.glb", scale: o.t === "fort" ? 6.5 : 5, nm, lv });
    } else if (o.t === "node") {
      const type = REAL_RES_MAP[o.res] || "farm";
      const nm = RES_SITE_NAME[o.res] || "Точка";
      const lv = "ур. " + (o.lv ?? "?");
      out.push({ key, x: o.x + 0.5, y: o.y + 0.5, gx: o.x, gy: o.y, kind: 2, model: `/models/resources/${type}.glb`, scale: 5, nm, lv });
    }
  }
  return out;
}
