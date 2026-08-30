/* Excel 导入解析：按表头自动识别 站点/线路/驻站人（复用 npm xlsx） */
import * as XLSX from 'xlsx';

// 站点名规范化：去开头 *、统一全角括号、去掉空白
export function normalizeStation(s) {
  return String(s === null || s === undefined ? '' : s)
    .trim()
    .replace(/^\*+/, '')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\s+/g, '');
}

function normalizeSimple(s) {
  return String(s === null || s === undefined ? '' : s).trim();
}

const STATION_HEAD = /站名|站点|车站|驻站站名|线路站点|全部/;
const CHECKER_HEAD = /驻站人|检查人|人员|姓名/;
const ROUTE_HEAD = /线路|路线|线名|公交线路/;
const ANY_HEAD = /站名|站点|车站|驻站站名|线路站点|全部|驻站人|检查人|人员|姓名|线路|路线|线名|公交线路/;

// ---------- 司售人员名单解析（姓名 + 岗位 + 科室/线路） ----------
export const STAFF_DRIVER_POSITIONS = new Set(['驾驶员', '旅游车驾驶员', '常务司机']);
export const STAFF_CONDUCTOR_POSITIONS = new Set(['乘务员']);

// 线路名规范化：别名映射 + 去掉全角括号后缀（如 1652路（工业区三路）→ 1652路）
const ROUTE_ALIAS = { 枫一: '枫泾1路', 枫二: '枫泾2路', 枫六: '枫泾6路', 朱枫专线: '朱枫线' };

export function normalizeStaffRoute(raw, position) {
  const v = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!v || v === position) return '';
  if (ROUTE_ALIAS[v]) return ROUTE_ALIAS[v];
  const m = v.match(/^(.+?)（/);
  return m ? m[1].trim() : v;
}

// rows: 二维数组（字符串），来自 sheet_to_json(ws, {header:1, raw:false, defval:''})
export function parseStaff(rows) {
  const grid = [];
  (rows || []).forEach((r) => {
    const row = [];
    (r || []).forEach((v) => {
      row.push(String(v === null || v === undefined ? '' : v).trim());
    });
    grid.push(row);
  });

  let headerIdx = -1;
  let nameCol = -1;
  let posCol = -1;
  let routeCol = -1;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const cells = grid[i] || [];
    const nc = cells.findIndex((c) => c === '姓名');
    const pc = cells.findIndex((c) => c === '岗位');
    if (nc >= 0 && pc >= 0) {
      headerIdx = i;
      nameCol = nc;
      posCol = pc;
      routeCol = cells.findIndex((c) => c === '科室/线路');
      break;
    }
  }
  if (headerIdx < 0) return { drivers: [], conductors: [] };

  const drivers = [];
  const conductors = [];
  const seenD = new Set();
  const seenC = new Set();
  for (let ri = headerIdx + 1; ri < grid.length; ri++) {
    const name = String(grid[ri][nameCol] || '').trim();
    if (!name) continue;
    const pos = String(grid[ri][posCol] || '').trim();
    const rawRoute = routeCol >= 0 ? String(grid[ri][routeCol] || '').trim() : '';
    if (STAFF_DRIVER_POSITIONS.has(pos)) {
      if (seenD.has(name)) continue;
      seenD.add(name);
      drivers.push({ name, routeName: normalizeStaffRoute(rawRoute, pos) });
    } else if (STAFF_CONDUCTOR_POSITIONS.has(pos)) {
      if (seenC.has(name)) continue;
      seenC.add(name);
      conductors.push({ name, routeName: normalizeStaffRoute(rawRoute, pos) });
    }
  }
  return { drivers, conductors };
}

// rows: 二维数组（字符串），来自 sheet_to_json(ws, {header:1, raw:false, defval:''})
export function parseFile(rows) {
  const grid = [];
  (rows || []).forEach((r) => {
    const row = [];
    (r || []).forEach((v) => {
      row.push(String(v === null || v === undefined ? '' : v).trim());
    });
    grid.push(row);
  });

  // 司售名单格式（姓名 + 岗位）：按岗位解析驾驶员/售票员，不再把姓名当驻站人
  const staff = parseStaff(grid);
  if (staff.drivers.length || staff.conductors.length) {
    return { stations: [], routes: [], checkers: [], ...staff };
  }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const hit = grid[i].some((cell) => {
      return cell && (STATION_HEAD.test(cell) || CHECKER_HEAD.test(cell) || ROUTE_HEAD.test(cell));
    });
    if (hit) {
      headerIdx = i;
      break;
    }
  }

  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 0;
  const checkers = [];
  let checkerCol = -1;
  if (headerIdx >= 0) {
    for (let cc = 0; cc < grid[headerIdx].length; cc++) {
      if (CHECKER_HEAD.test(grid[headerIdx][cc])) {
        checkerCol = cc;
        break;
      }
    }
  }
  if (checkerCol >= 0) {
    const seenChecker = {};
    for (let rc = dataStart; rc < grid.length; rc++) {
      const vc = normalizeSimple(grid[rc][checkerCol]);
      if (vc && !seenChecker[vc]) {
        seenChecker[vc] = 1;
        checkers.push(vc);
      }
    }
  } else {
    // 兜底：只有一列有数据时按整列导入
    const nonEmptyCols = [];
    for (let ci = 0; ci < (grid[0] ? grid[0].length : 0); ci++) {
      let n = 0;
      for (let rn = dataStart; rn < grid.length; rn++) {
        if (normalizeSimple(grid[rn][ci])) n++;
      }
      if (n > 0) nonEmptyCols.push(ci);
    }
    if (nonEmptyCols.length === 1) {
      const seenC = {};
      for (let rw = dataStart; rw < grid.length; rw++) {
        const vw = normalizeSimple(grid[rw][nonEmptyCols[0]]);
        if (vw && !seenC[vw]) {
          seenC[vw] = 1;
          checkers.push(vw);
        }
      }
    }
  }

  // 跳过列：驻站人列、以及"全部"汇总列（内容与各线路列重复）
  const skipCols = {};
  if (checkerCol >= 0) skipCols[checkerCol] = 1;
  if (headerIdx >= 0) {
    grid[headerIdx].forEach((cell, c) => {
      if (normalizeSimple(cell) === '全部') skipCols[c] = 1;
    });
  }

  // 线路列：表头非空且不是「站点/线路/全部」等关键词的列，视为「每列一条线路」布局，
  // 该列站点归属表头线路；共线站（同站名出现在多条线路）按 站名|线路 分别生成一条。
  const routeCols = [];
  if (headerIdx >= 0) {
    grid[headerIdx].forEach((cell, c) => {
      const v = normalizeSimple(cell);
      if (v && !ANY_HEAD.test(v)) routeCols.push(c);
    });
  }

  const stations = [];
  const seenStation = {};
  if (routeCols.length) {
    routeCols.forEach((c) => {
      const routeName = normalizeSimple(grid[headerIdx][c]);
      let sortOrder = 0;
      for (let r = dataStart; r < grid.length; r++) {
        const v = normalizeStation(grid[r][c]);
        if (!v) continue;
        const key = v + '|' + routeName;
        if (!seenStation[key]) {
          seenStation[key] = 1;
          stations.push({ name: v, routeName, sortOrder: sortOrder++ });
        }
      }
    });
  } else {
    for (let r = dataStart; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (skipCols[c]) continue;
        const v = normalizeStation(grid[r][c]);
        if (v && !seenStation[v]) {
          seenStation[v] = 1;
          stations.push({ name: v, routeName: '', sortOrder: 0 });
        }
      }
    }
  }

  const routes = [];
  const seenRoute = {};
  if (headerIdx >= 0) {
    grid[headerIdx].forEach((cell) => {
      const v = normalizeSimple(cell);
      if (v && !ANY_HEAD.test(v) && !seenRoute[v]) {
        seenRoute[v] = 1;
        routes.push(v);
      }
    });
  }
  const hasAnyHeader =
    headerIdx >= 0 &&
    grid[headerIdx].some((cell) => {
      return cell && ANY_HEAD.test(cell);
    });
  if (!routes.length && !hasAnyHeader) {
    // 兜底：无表头时取第一列数据
    for (let rr = dataStart; rr < grid.length; rr++) {
      const vv = normalizeSimple(grid[rr][0]);
      if (vv && !seenRoute[vv]) {
        seenRoute[vv] = 1;
        routes.push(vv);
      }
    }
  }

  return { stations, routes, checkers, drivers: [], conductors: [] };
}

// 合并统计：existing 为数组，incoming 为数组
export function mergeStats(existing, incoming) {
  const set = {};
  (existing || []).forEach((v) => {
    set[v] = 1;
  });
  const added = [];
  let dup = 0;
  (incoming || []).forEach((v) => {
    if (set[v]) dup++;
    else {
      set[v] = 1;
      added.push(v);
    }
  });
  return { total: (incoming || []).length, added, duplicate: dup };
}

// 读取文件（ArrayBuffer）并解析，返回 {stations, routes, checkers}
export function readFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return parseFile(rows);
}
