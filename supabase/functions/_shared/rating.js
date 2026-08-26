// =============================================================================
// Боевой рейтинг и звания — канонические правила.
// =============================================================================
// Полное описание с доводами — docs/RANKS.md. Здесь только чистые функции.
//
// ВНИМАНИЕ. Это ИСТОЧНИК, но не то, что исполняется на сервере: редактор Edge
// Functions в Dashboard не тянет относительные импорты, поэтому mp-tick и
// mp-join несут дословные копии этого файла (тот же приём, что у cors.js и
// rules.js). Правишь здесь — правь обе копии и зеркало в index.html.

// ---- Столб званий ----------------------------------------------------------
// Ширина звания 770, ступень 154. У Божества/Властителя Хаоса ширина 880 и
// ступень 176: верхняя граница взята из чисел автора (Титан с 5500).
export const RANK_BAND = 770;
export const RANK_STEPS = 5;

// from — нижняя граница по модулю. Последнее звание в каждом столбе
// безгранично (to = null) и ступеней не имеет, как Immortal в Dota 2.
export const RANKS_UP = [
  { key: "recruit",  name: "Рекрут",     from: 0,    to: 769 },
  { key: "guard",    name: "Страж",      from: 770,  to: 1539 },
  { key: "knight",   name: "Рыцарь",     from: 1540, to: 2309 },
  { key: "hero",     name: "Герой",      from: 2310, to: 3079 },
  { key: "legend",   name: "Легенда",    from: 3080, to: 3849 },
  { key: "overlord", name: "Властелин",  from: 3850, to: 4619 },
  { key: "deity",    name: "Божество",   from: 4620, to: 5499 },
  { key: "titan",    name: "Титан",      from: 5500, to: null },
];
export const RANKS_DOWN = [
  { key: "dishonoured", name: "Бесчестный",         from: 1,    to: 769 },
  { key: "branded",     name: "Заклеймённый",       from: 770,  to: 1539 },
  { key: "oathbreaker", name: "Клятвопреступник",   from: 1540, to: 2309 },
  { key: "darkadept",   name: "Адепт тьмы",         from: 2310, to: 3079 },
  { key: "cursed",      name: "Проклятый",          from: 3080, to: 3849 },
  { key: "destroyer",   name: "Разрушитель",        from: 3850, to: 4619 },
  { key: "chaoslord",   name: "Властитель Хаоса",   from: 4620, to: 5499 },
  { key: "worldender",  name: "Уничтожитель миров", from: 5500, to: null },
];

const ROMAN = ["I", "II", "III", "IV", "V"];

// Звание по рейтингу. Ступень: V — ближайшая к нулю, I — дальняя. Правило одно
// на оба столба: I всегда крайняя ступень в сторону движения. У безграничного
// верхнего звания ступени нет (step = 0, roman = "").
export function rankOf(rating) {
  const r = Math.round(rating || 0);
  const down = r < 0;
  const mag = Math.abs(r);
  const table = down ? RANKS_DOWN : RANKS_UP;
  let band = table[0];
  for (const b of table) { if (mag >= b.from) band = b; }
  let step = 0, roman = "";
  if (band.to != null) {
    const width = band.to - band.from + 1;
    const per = width / RANK_STEPS;
    const idx = Math.min(RANK_STEPS - 1, Math.floor((mag - band.from) / per));
    step = RANK_STEPS - idx;              // 5 у ближней к нулю, 1 у дальней
    roman = ROMAN[step - 1];
  }
  return {
    key: band.key, name: band.name, down, step, roman,
    full: roman ? band.name + " " + roman : band.name,
  };
}

// ---- Сезоны ----------------------------------------------------------------
// Настоящие времена года, по три месяца. Зима года Y — это декабрь Y-1 плюс
// январь и февраль Y, поэтому у декабря ключ следующего года.
export const SEASON_NAMES = { winter: "Зимы", spring: "Весны", summer: "Лета", autumn: "Осени" };

export function seasonKeyAt(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  if (m === 12) return (y + 1) + "-winter";
  if (m <= 2) return y + "-winter";
  if (m <= 5) return y + "-spring";
  if (m <= 8) return y + "-summer";
  return y + "-autumn";
}
export function seasonTitle(key) {
  const [y, s] = String(key || "").split("-");
  return SEASON_NAMES[s] ? "Сезон " + SEASON_NAMES[s] + " " + y : "";
}
// Мягкий пересчёт на смене сезона: слава тускнеет быстро, позор — медленно.
export const SEASON_KEEP_UP = 0.6, SEASON_KEEP_DOWN = 0.9;
export function seasonReset(rating) {
  const r = Math.round(rating || 0);
  return Math.round(r > 0 ? r * SEASON_KEEP_UP : r * SEASON_KEEP_DOWN);
}

// ---- Затухание -------------------------------------------------------------
// Работа одна: не дать верхушке забиться теми, кто уже не играет. Ниже порога
// не трогает никого, и опустить ниже порога тоже не может.
export const DECAY_FROM = 3850;        // Властелин и выше
export const DECAY_GRACE_DAYS = 14;
export const DECAY_PER_DAY = 25;

// Возвращает { rating, days } — сколько снять и за сколько дней (дни нужны
// вызывающему, чтобы сдвинуть отметку и не применить затухание дважды).
export function decayRating(rating, lastAtMs, nowMs) {
  const r = Math.round(rating || 0);
  if (r <= DECAY_FROM || !lastAtMs) return { rating: r, days: 0 };
  const idleDays = Math.floor((nowMs - lastAtMs) / 86400000) - DECAY_GRACE_DAYS;
  if (idleDays <= 0) return { rating: r, days: 0 };
  return { rating: Math.max(DECAY_FROM, r - DECAY_PER_DAY * idleDays), days: idleDays };
}

// ---- Счёт боя --------------------------------------------------------------
export const CALIBRATION_BATTLES = 10;  // пока идут — звания нет, ниже нуля не пускаем
export const NO_FIGHT_K = 0.1;          // «бой без боя» — не считается никому
export const EQUAL_K = 0.5;             // порог равного боя
export const WIN_EQUAL = 25;            // равный бой
export const WIN_WEAK = 50;             // слабый победил
export const LOSS_STRONG = 50;          // сильный проиграл
export const RAID_PENALTY_FRAC = 0.02;  // сильный напал на слабейшего и победил
export const RAID_PENALTY_MIN = 25;

// Потолок пары. Стартовая настройка нарочно мягкая — игроков мало (см.
// docs/RANKS.md, там же расписание на 50 и 200 живых игроков).
export const PAIR_CAP_BATTLES = 4;
export const PAIR_CAP_WINDOW_MS = 60 * 60 * 1000;   // час

const ratio = (a, b) => {
  const x = Math.max(0, a || 0), y = Math.max(0, b || 0);
  const hi = Math.max(x, y);
  return hi <= 0 ? 0 : Math.min(x, y) / hi;
};

// Штраф зачинщику за избиение слабейшего: процент от собственного рейтинга,
// но не меньше минимума. Ниже нуля процент отключается — иначе спуск разгонялся
// бы сам и дно доставалось бы скоростью, а не поведением.
export function raidPenalty(rating) {
  const r = Math.round(rating || 0);
  return r > 0 ? Math.max(RAID_PENALTY_MIN, Math.round(r * RAID_PENALTY_FRAC)) : RAID_PENALTY_MIN;
}

// Главная функция. На входе — всё, что известно о бое; на выходе — дельты
// обеим сторонам и полный разбор для журнала rating_events.
//
//   attField/defField — мощь вышедших в поле войск (видимый коэффициент)
//   attPower/defPower — мощь держав ДО боя (скрытый коэффициент)
//   attRating         — рейтинг нападающего до боя (нужен для процента штрафа)
//   winner            — "att" | "def"
//   pairBattles       — сколько боёв у этой пары уже засчитано за окно
//
// Нападающий (att) — всегда зачинщик: это его марш пришёл.
export function scoreBattle(o) {
  const kField = ratio(o.attField, o.defField);
  const kPower = ratio(o.attPower, o.defPower);
  const base = { kField, kPower, k: Math.min(kField, kPower), attDelta: 0, defDelta: 0, counted: false };

  if ((o.pairBattles || 0) >= PAIR_CAP_BATTLES) {
    return { ...base, reason: "потолок пары" };
  }

  const attWon = o.winner === "att";
  const k = base.k;

  // Равный бой. Порог смотрит на МЕНЬШИЙ из коэффициентов, поэтому кит,
  // подкрутивший марш под новичка (k_поле = 1, k_держава = 0.1), сюда не
  // попадает: подкрутить державу под один бой нельзя.
  if (k >= EQUAL_K) {
    return { ...base, counted: true, reason: "равный бой",
             attDelta: attWon ? WIN_EQUAL : -WIN_EQUAL,
             defDelta: attWon ? -WIN_EQUAL : WIN_EQUAL };
  }

  // Дальше бой неравный. Но неравенство бывает двух разных природ, и путать их
  // нельзя.
  //
  // Если державы сопоставимы (k_держава >= порога), а разошлось только поле —
  // это не избиение, а ход в войне равных: защитник увёл гарнизон, или
  // нападающий пришёл малым отрядом на пробу. Наказывать тут некого и не за
  // что, и награждать тоже: боя по сути не было. Ноль обоим.
  //
  // Это же и есть настоящий «отказ от боя»: эвакуировав город, защитник не
  // отдаёт рейтинг — но и нападающий не получает штрафа за чужое решение.
  if (kPower >= EQUAL_K) {
    return { ...base, reason: "поле не сошлось" };
  }

  // Неравенство ДЕРЖАВ — вот тут работает таблица. Сильная сторона определяется
  // по державной мощи, а не по полю: поле нападающий выбирает сам, державу — нет.
  const attIsStrong = (o.attPower || 0) >= (o.defPower || 0);

  let attDelta = 0, defDelta = 0, reason;
  if (attWon && attIsStrong) {
    // Зачинщик разбил заведомо слабейшего. Штраф считается ВСЕГДА, в том числе
    // когда защиты не было вовсе: иначе кит уходил бы от наказания, выбирая
    // самые беззащитные цели, — ровно наоборот тому, ради чего штраф заведён.
    // Слабому ноль: рейтинг тут не переходит, а сгорает.
    attDelta = -raidPenalty(o.attRating); reason = "избиение слабого";
  } else if (attWon && !attIsStrong) {
    // Слабый взял город сильного. Проверка «бой без боя» нужна ровно здесь и
    // только здесь: иначе кит оставлял бы пустой город, а десяток альтов
    // «побеждал» бы его и набирал по +50.
    //
    // Смотрим ИМЕННО на проигравшего, а не на k_поле вообще. Мелкий k_поле
    // бывает двух совершенно разных природ: «защиты не было» (скармливание,
    // гасим) и «нападавший пришёл втрое меньшим войском и всё равно взял верх»
    // (подвиг, награждаем). Один и тот же коэффициент, противоположный смысл —
    // различает их только то, чья сторона оказалась пустой.
    if ((o.defField || 0) < (o.attField || 0) * NO_FIGHT_K) {
      return { ...base, reason: "бой без боя" };
    }
    attDelta = WIN_WEAK; defDelta = -LOSS_STRONG; reason = "слабый взял сильного";
  } else if (!attWon && attIsStrong) {
    attDelta = -LOSS_STRONG; defDelta = WIN_WEAK; reason = "сильный не взял слабого";
  } else {
    // Слабый напал на сильного и не взял. Ему ноль — он и так наказан войском;
    // сильному ноль — он этот бой не выбирал, и если бы за оборону штрафовали,
    // пачка альтов сливала бы киту рейтинг одними подставами.
    reason = "оборона от слабого";
  }
  return { ...base, counted: true, reason, attDelta, defDelta, attIsStrong };
}

// Применение дельты к игроку с учётом калибровки: пока сыграно меньше
// CALIBRATION_BATTLES боёв, рейтинг не опускается ниже нуля. Без этого первое
// же поражение свежего игрока делало бы его Бесчестным — столб начинается с
// нуля, запаса вниз у новичка нет.
export function applyDelta(rating, battlesPlayed, delta) {
  let v = Math.round((rating || 0) + delta);
  if ((battlesPlayed || 0) < CALIBRATION_BATTLES && v < 0) v = 0;
  return v;
}
