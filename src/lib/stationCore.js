/* 驻站检查纯逻辑：格式化、分组、生成导出行数据（与 DOM 无关，便于测试） */

export function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function nowTime() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// "2026-08-16" -> "8月16日"
export function dateLabel(dateStr) {
  if (!dateStr) return '';
  const p = String(dateStr).split('-');
  if (p.length !== 3) return String(dateStr);
  return Number(p[1]) + '月' + Number(p[2]) + '日';
}

// "2026-08-16" -> "8.16"（文件名用，月份/日期不补零）
export function dateDot(dateStr) {
  if (!dateStr) return '';
  const p = String(dateStr).split('-');
  if (p.length !== 3) return String(dateStr);
  return Number(p[1]) + '.' + Number(p[2]);
}

export function normalize(s) {
  return String(s === null || s === undefined ? '' : s).trim();
}

// 车号统一格式：全角转半角、去空格/横线/点等分隔符、字母大写
export function normalizePlate(s) {
  let v = String(s === null || s === undefined ? '' : s);
  v = v
    .replace(/\u3000/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s\-－—–·．.]+/g, '')
    .toUpperCase();
  return v;
}

// 转数字：空值/非法值统一按 0 处理（上客人数全面统一为 0）
export function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// 文件名安全化（去掉 Windows 不允许的字符）
export function safeName(s) {
  return normalize(s).replace(/[\\/:*?"<>|]/g, '_');
}

// 按 日期+站点 分组，组内按时间排序
export function groupRecords(records) {
  const map = new Map();
  (records || []).forEach((r) => {
    const key = r.date + '|' + normalize(r.station);
    if (!map.has(key)) {
      map.set(key, { date: r.date, station: normalize(r.station), records: [] });
    }
    map.get(key).records.push(r);
  });
  const groups = Array.from(map.values());
  groups.forEach((g) => {
    g.records.sort((a, b) => normalize(a.time).localeCompare(normalize(b.time)));
    g.count = g.records.length;
    g.dateLabel = dateLabel(g.date);
    g.checker = g.records[0] ? normalize(g.records[0].checker) : '';
  });
  groups.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return groups;
}

// 将一组记录转为模板 30 行需要的行数据
export function toRecordRows(records) {
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const r = records[i];
    rows.push(
      r
        ? {
            route: normalize(r.route),
            plate: normalize(r.plate),
            time: normalize(r.time),
            boarding: toNum(r.boarding),
            stationNorms: normalize(r.stationNorms),
            conductorCall: normalize(r.conductorCall),
            checkResult: normalize(r.checkResult),
            rectification: normalize(r.rectification),
            remark: normalize(r.remark),
          }
        : null
    );
  }
  return rows;
}

export function validRecord(r) {
  return !!(
    r &&
    normalize(r.station) &&
    normalize(r.checker) &&
    normalize(r.date) &&
    normalize(r.route) &&
    normalize(r.plate)
  );
}
