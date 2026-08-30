export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function monthStartStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function weekStartStr(d = new Date()) {
  const weekday = d.getDay() || 7; // 周一为 1，周日为 7
  const s = new Date(d);
  s.setDate(d.getDate() - weekday + 1);
  return toDateStr(s);
}

export function periodStartDate(period, d = new Date()) {
  if (period === 'week') return weekStartStr(d);
  if (period === 'month') return monthStartStr(d);
  return toDateStr(d);
}

export function periodLabel(period) {
  return period === 'day' ? '日' : period === 'week' ? '周' : '月';
}

export function formatM_D(dateStr) {
  const [, t, r] = String(dateStr).split('-');
  return `${parseInt(t, 10)}.${parseInt(r, 10)}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toDateStr(dt);
}
