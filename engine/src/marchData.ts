/* =========================================================================
   Позиции активных походов (W.marches) — читаются напрямую из
   window.parent.W КАЖДЫЙ КАДР (не через дозированный loadRealEntities()
   из realData.ts, который сканирует всю W.map — для десятка активных
   походов это было бы избыточно 60 раз в секунду). Интерполяция по пути —
   дословный порт pathPointAt(m,f)/marchPos(m) из index.html: тот же
   алгоритм накопленных длин сегментов, чтобы движение маркера в 3D
   совпадало с тем, что вычисляет сама партия.
   ========================================================================= */

// Фаза 27 — тот же "живой" бой, что уже рисует index.html (mpBattleInterp/
// mpHpBarHtml), теперь ещё и в 3D — надземная метка над маршем в
// state:"siege" (updateBattleLabels в main.ts), видна ЛЮБОМУ игроку, не
// только сторонам боя (marches_select_all уже открыт всем, см.
// mpRefreshWorldBattles в index.html). Поля — прямая копия того, что
// сервер кладёт в marches.data.battle (см. runPvpBattleRounds/
// runRaidBattleRounds в mp-tick): не пересчитываем ничего заново, просто
// протаскиваем нужные для интерполяции/подписи числа через LiveMarch.
export interface LiveBattleInfo {
  round: number;
  revealFromRound: number;
  retreating: boolean;
  attHpLeft: number; attStartHp: number; revealFromAttHp: number;
  defHpLeft: number; defStartHp: number; revealFromDefHp: number;
  revealStart: number; revealAt: number;
}

export interface LiveMarchPos {
  x: number;
  y: number;
  own: boolean; // поход игрока (W.players[0]) или чужой — цвет маркера в main.ts
  // Поля ниже — только для тапа/инфо-панели (см. main.ts findMarchAtScreen
  // и index.html renderMarchCartoucheFor): march id из W.marches (не bitECS
  // eid — марши не заведены как настоящие сущности, см. main.ts), ник
  // владельца, суммарное число воинов, состояние и цель похода.
  id: number;
  nick: string;
  unitsTotal: number;
  state: string;
  tx: number;
  ty: number;
  t1: number;
  battle: LiveBattleInfo | null;
}

interface LiveMarch {
  id: number;
  pid: number;
  tx: number;
  ty: number;
  t0: number;
  t1: number;
  state: string;
  units: Record<string, Record<number, number>>;
  path?: { x: number; y: number }[];
  pathCum?: number[];
  pathLen?: number;
  data?: { battle?: any } | null;
}

interface LiveWorldMarches {
  t: number;
  marches: LiveMarch[];
  players: Array<{ id: number; nick?: string; name?: string }>;
}

function countUnits(units: Record<string, Record<number, number>>): number {
  let n = 0;
  for (const t in units) for (const i in units[t]) n += units[t][+i] || 0;
  return n;
}

// Фаза 12, кусочек 2 — тот же приём, что и readLiveWorld в realData.ts:
// window.parent.mpWorldSnapshot (когда есть и не null — игрок в общем
// мире) первее обычного W, иначе прежнее поведение с локальными ботами.
function readLiveWorldMarches(): LiveWorldMarches | null {
  try {
    const w = window.parent;
    if (w && w !== window) {
      const snap = (w as any).mpWorldSnapshot;
      if (typeof snap === "function") {
        const mp = snap();
        if (mp) return mp as LiveWorldMarches;
      }
      if ((w as any).W) return (w as any).W as LiveWorldMarches;
    }
  } catch (_) {
    /* кросс-origin — считаем, что настоящих данных нет */
  }
  return null;
}

// Дословный порт pathPointAt из index.html.
function pathPointAt(m: LiveMarch, f: number): { x: number; y: number } {
  const path = m.path, cum = m.pathCum;
  if (!path || path.length < 2) return (path && path[0]) || { x: m.tx, y: m.ty };
  const target = f * (m.pathLen ?? 0);
  for (let i = 1; i < cum!.length; i++) {
    if (cum![i] >= target) {
      const segLen = cum![i] - cum![i - 1];
      const segF = segLen > 0 ? (target - cum![i - 1]) / segLen : 0;
      const a = path[i - 1], b = path[i];
      return { x: a.x + (b.x - a.x) * segF, y: a.y + (b.y - a.y) * segF };
    }
  }
  return path[path.length - 1];
}

export function loadLiveMarches(): LiveMarchPos[] | null {
  const W = readLiveWorldMarches();
  if (!W || !W.marches) return null;
  const ownId = W.players[0] ? W.players[0].id : -1;
  // Раньше — W.players.find(...) ВНУТРИ цикла по маршам: O(маршей×игроков)
  // КАЖДЫЙ вызов (а вызывается loadLiveMarches КАЖДЫЙ кадр, см. main.ts
  // draw()→marchMarkers() — не по таймеру, в отличие от loadRealEntities).
  // В живом мире с сотнями активных маршей и игроков это заметная, чисто
  // алгоритмическая цена, не зависящая от того, куда смотрит камера —
  // строим карту один раз на вызов (O(игроков)), дальше поиск владельца
  // O(1) на марш вместо O(игроков).
  const playersById = new Map<number, { id: number; nick?: string; name?: string }>();
  for (const p of W.players) playersById.set(p.id, p);
  const out: LiveMarchPos[] = [];
  for (const m of W.marches) {
    const p =
      m.state === "gather" || m.state === "siege"
        ? { x: m.tx, y: m.ty }
        : pathPointAt(m, Math.max(0, Math.min(1, (W.t - m.t0) / Math.max(1, m.t1 - m.t0))));
    const owner = playersById.get(m.pid);
    const b = m.state === "siege" && m.data && m.data.battle ? m.data.battle : null;
    const battle: LiveBattleInfo | null = b
      ? {
          round: b.round ?? 0,
          revealFromRound: b.revealFromRound ?? 0,
          retreating: !!(b.retreatRequested || b.retreated),
          attHpLeft: b.attHpLeft ?? 0, attStartHp: b.attStartHp ?? 1, revealFromAttHp: b.revealFromAttHp ?? b.attHpLeft ?? 0,
          defHpLeft: b.defHpLeft ?? 0, defStartHp: b.defStartHp ?? 1, revealFromDefHp: b.revealFromDefHp ?? b.defHpLeft ?? 0,
          revealStart: b.revealStart ?? 0, revealAt: b.revealAt ?? 0,
        }
      : null;
    out.push({
      x: p.x,
      y: p.y,
      own: m.pid === ownId,
      id: m.id,
      nick: owner?.nick ?? owner?.name ?? "?",
      unitsTotal: countUnits(m.units),
      state: m.state,
      tx: m.tx,
      ty: m.ty,
      t1: m.t1,
      battle,
    });
  }
  return out;
}
