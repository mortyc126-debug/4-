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
// Фаза 29 — вторая половина осады: армия защитника разбита, тараны взялись
// за сам город. Полоска обороны в этот момент показывает ноль и сообщать ей
// нечего — вместо неё метка показывает ту постройку, которую ломают прямо
// сейчас, и её прочность (demolish.*, см. runDemolishRounds в mp-tick).
export interface LiveDemolishInfo {
  round: number;              // какой заход тарана из DEMOLISH_ROUNDS
  ruinedN: number;            // сколько построек уже обрушено за эту осаду
  name: string | null;        // что ломают прямо сейчас
  hp: number; max: number; revealFromHp: number;
  sameTarget: boolean;        // цель не сменилась за этот кусок — можно доводить полоску плавно
}
export interface LiveBattleInfo {
  round: number;
  revealFromRound: number;
  retreating: boolean;
  attHpLeft: number; attStartHp: number; revealFromAttHp: number;
  defHpLeft: number; defStartHp: number; revealFromDefHp: number;
  revealStart: number; revealAt: number;
  demolish: LiveDemolishInfo | null;
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
  // Поля ниже — для выбора 3D-модели похода (main.ts, marchModelPath):
  // раса владельца, номер выбранного им полководца (0/1, null — не выбран),
  // взят ли полководец В ЭТОТ поход и разведка ли это. Тот же принцип, что
  // в Total War: с полководцем идёт модель самого полководца, без него —
  // «армия без генерала» своей расы, у разведки своя модель.
  race: string;
  genId: number | null;
  hasGen: boolean;
  scout: boolean;
  // Курс движения (радианы, для modelMatrix) — чтобы модель шла ЛИЦОМ по
  // пути, а не всегда на север. NaN — курса нет (отряд стоит: сбор/осада/
  // "на позиции"), тогда main.ts сохраняет прежний разворот.
  yaw: number;
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
  mode?: string;
  // hasGen — одиночная игра (sendMarch кладёт его прямо в марш),
  // data.has_gen — общий мир (Edge Functions пишут его в JSON-поле data
  // строки marches: см. mp-attack/mp-raid/mp-gather). Одно и то же по
  // смыслу, просто исторически разные имена в двух источниках.
  hasGen?: boolean;
  data?: { battle?: any; has_gen?: boolean } | null;
}

interface LiveWorldMarches {
  t: number;
  marches: LiveMarch[];
  players: Array<{ id: number; nick?: string; name?: string; race?: string; gen?: { id?: number | null } | null }>;
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

// Насколько вперёд/назад по пути смотреть, вычисляя курс модели. Доля от
// ВСЕГО пути: на длинном марше это десятки клеток, на коротком — метры;
// нам нужна только СТОРОНА движения, точность тут ни при чём, а слишком
// маленький шаг упёрся бы в погрешность float на медленных участках.
const YAW_LOOKAHEAD = 0.004;

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
  const playersById = new Map<number, { id: number; nick?: string; name?: string; race?: string; gen?: { id?: number | null } | null }>();
  for (const p of W.players) playersById.set(p.id, p);
  const out: LiveMarchPos[] = [];
  for (const m of W.marches) {
    const p =
      // "hold" — отряд стоит на позиции, куда его привели перетаскиванием
      // (см. mode:"move" в index.html/mp-tick): он никуда не движется, так что
      // и интерполировать нечего — рисуем прямо в цели, как gather/siege.
      m.state === "gather" || m.state === "siege" || m.state === "hold"
        ? { x: m.tx, y: m.ty }
        : pathPointAt(m, Math.max(0, Math.min(1, (W.t - m.t0) / Math.max(1, m.t1 - m.t0))));
    const owner = playersById.get(m.pid);
    // Курс — по двум точкам пути рядом с текущим положением (а не по
    // разнице кадров: на паузе/при followMarch кадры могут идти без
    // движения вовсе, и разворот дёргался бы от шума). Стоящий отряд
    // (сбор/осада/"на позиции") курса не имеет — NaN, см. LiveMarchPos.yaw.
    let yaw = NaN;
    if (m.state !== "gather" && m.state !== "siege" && m.state !== "hold") {
      const f = Math.max(0, Math.min(1, (W.t - m.t0) / Math.max(1, m.t1 - m.t0)));
      const a = pathPointAt(m, Math.max(0, f - YAW_LOOKAHEAD));
      const b = pathPointAt(m, Math.min(1, f + YAW_LOOKAHEAD));
      const dx = b.x - a.x, dy = b.y - a.y;
      // Модели походов смотрят в +Z (проверено рендером силуэтов со всех
      // четырёх сторон, см. tools/decimate_glb.mjs рядом), а modelMatrix
      // переводит локальный +Z в (sin yaw, 0, cos yaw) — отсюда atan2(dx,dz).
      if (dx * dx + dy * dy > 1e-12) yaw = Math.atan2(dx, dy);
    }
    const b = m.state === "siege" && m.data && m.data.battle ? m.data.battle : null;
    const battle: LiveBattleInfo | null = b
      ? {
          round: b.round ?? 0,
          revealFromRound: b.revealFromRound ?? 0,
          retreating: !!(b.retreatRequested || b.retreated),
          attHpLeft: b.attHpLeft ?? 0, attStartHp: b.attStartHp ?? 1, revealFromAttHp: b.revealFromAttHp ?? b.attHpLeft ?? 0,
          defHpLeft: b.defHpLeft ?? 0, defStartHp: b.defStartHp ?? 1, revealFromDefHp: b.revealFromDefHp ?? b.defHpLeft ?? 0,
          revealStart: b.revealStart ?? 0, revealAt: b.revealAt ?? 0,
          demolish: b.phase === "demolish" && b.demolish
            ? {
                round: b.demolish.round ?? 0,
                ruinedN: (b.demolish.ruined && b.demolish.ruined.length) || 0,
                name: b.demolish.curName ?? null,
                hp: b.demolish.curHp ?? 0,
                max: b.demolish.curMax ?? 0,
                revealFromHp: b.demolish.revealFromHp ?? b.demolish.curHp ?? 0,
                sameTarget: b.demolish.revealFromKey === b.demolish.curKey,
              }
            : null,
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
      race: owner?.race ?? "human",
      genId: owner && owner.gen && owner.gen.id != null ? owner.gen.id : null,
      hasGen: !!(m.hasGen ?? (m.data && m.data.has_gen)),
      scout: m.mode === "scout" || m.mode === "scoutmarch",
      yaw,
    });
  }
  return out;
}
