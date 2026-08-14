/* =========================================================================
   Позиции активных походов (W.marches) — читаются напрямую из
   window.parent.W КАЖДЫЙ КАДР (не через дозированный loadRealEntities()
   из realData.ts, который сканирует всю W.map — для десятка активных
   походов это было бы избыточно 60 раз в секунду). Интерполяция по пути —
   дословный порт pathPointAt(m,f)/marchPos(m) из index.html: тот же
   алгоритм накопленных длин сегментов, чтобы движение маркера в 3D
   совпадало с тем, что вычисляет сама партия.
   ========================================================================= */

export interface LiveMarchPos {
  x: number;
  y: number;
  own: boolean; // поход игрока (W.players[0]) или чужой — цвет маркера в main.ts
}

interface LiveMarch {
  pid: number;
  tx: number;
  ty: number;
  t0: number;
  t1: number;
  state: string;
  path?: { x: number; y: number }[];
  pathCum?: number[];
  pathLen?: number;
}

interface LiveWorldMarches {
  t: number;
  marches: LiveMarch[];
  players: Array<{ id: number }>;
}

function readLiveWorldMarches(): LiveWorldMarches | null {
  try {
    const w = window.parent;
    if (w && w !== window && (w as any).W) return (w as any).W as LiveWorldMarches;
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
  const out: LiveMarchPos[] = [];
  for (const m of W.marches) {
    const p =
      m.state === "gather" || m.state === "siege"
        ? { x: m.tx, y: m.ty }
        : pathPointAt(m, Math.max(0, Math.min(1, (W.t - m.t0) / Math.max(1, m.t1 - m.t0))));
    out.push({ x: p.x, y: p.y, own: m.pid === ownId });
  }
  return out;
}
