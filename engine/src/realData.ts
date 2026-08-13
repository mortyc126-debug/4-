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
  x: number;
  y: number;
  kind: 0 | 1 | 2; // 0=город 1=лагерь/форт 2=точка ресурсов
  model: string;
  scale: number;
  own?: boolean; // столица игрока (W.players[0]) — та же договорённость, что и в остальной игре
  label: string; // подпись для клика/тапа (см. main.ts) — ник+ратуша, уровень лагеря/точки
}

const REAL_RES_MAP: Record<string, string> = { food: "farm", wood: "sawmill", stone: "quarry", gold: "gold-mine" };
// Те же подписи типов точек, что и RES_SITE_NAME в index.html (cartouche).
const RES_SITE_NAME: Record<string, string> = { food: "Пашня", wood: "Лесопилка", stone: "Каменоломня", gold: "Рудник" };
// Дословно epochOf из index.html — своей копии эпох тут нет, но эта чистая
// функция от одного числа (уровня ратуши) достаточно стабильна, чтобы не
// тянуть её через window.parent лишним мостом.
function epochOf(hall: number): number {
  return hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1;
}

interface LiveWorld {
  map: Record<string, any>;
  players: Array<{ id: number; race: string; nick?: string; b: { hall: number } }>;
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

export function loadRealEntities(): RealEntity[] | null {
  const W = readLiveWorld();
  if (!W) return null;
  const out: RealEntity[] = [];
  for (const key in W.map) {
    const o = W.map[key];
    if (o.t === "city") {
      const pl = W.players.find((p) => p.id === o.pid);
      const race = pl ? pl.race : "human";
      const epoch = pl ? Math.max(1, Math.min(5, epochOf(pl.b.hall))) : 1;
      const own = W.players[0] && pl && pl.id === W.players[0].id;
      const label = (pl ? pl.nick ?? "?" : "?") + (pl ? " · Ратуша " + pl.b.hall : "");
      out.push({ x: o.x + 0.5, y: o.y + 0.5, kind: 0, model: `/models/castles/${race}-${epoch}.glb`, scale: 10, own, label });
    } else if (o.t === "camp" || o.t === "fort") {
      const label = (o.t === "fort" ? "Форт" : "Лагерь") + " варваров · ур. " + (o.lv ?? "?");
      out.push({ x: o.x + 0.5, y: o.y + 0.5, kind: 1, model: "/models/camps/barbarians.glb", scale: o.t === "fort" ? 6.5 : 5, label });
    } else if (o.t === "node") {
      const type = REAL_RES_MAP[o.res] || "farm";
      const label = (RES_SITE_NAME[o.res] || "Точка") + " · ур. " + (o.lv ?? "?");
      out.push({ x: o.x + 0.5, y: o.y + 0.5, kind: 2, model: `/models/resources/${type}.glb`, scale: 5, label });
    }
  }
  return out;
}
