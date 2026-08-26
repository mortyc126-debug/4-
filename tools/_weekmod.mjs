function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Четверг той же недели — он и решает, к какому году неделя относится.
  const day = (t.getUTCDay() + 6) % 7;            // пн=0 … вс=6
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((t - firstThursday) / (7 * 86400000));
  return t.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function isoWeekRange(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day);
  const from = new Date(t);
  const to = new Date(t.getTime() + 7 * 86400000);
  return { from, to };
}
function isoWeekRangeFromKey(key) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(key || ""));
  if (!m) return null;
  const year = +m[1], week = +m[2];
  // Понедельник недели 1 — тот, на чьей неделе лежит 4 января.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4.getTime() - day * 86400000);
  const from = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
  return { from, to: new Date(from.getTime() + 7 * 86400000) };
}
export {isoWeekKey,isoWeekRange,isoWeekRangeFromKey};
