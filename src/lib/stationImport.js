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

  const stations = [];
  const seenStation = {};
  for (let r = dataStart; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (skipCols[c]) continue;
      const v = normalizeStation(grid[r][c]);
      if (v && !seenStation[v]) {
        seenStation[v] = 1;
        stations.push(v);
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

  return { stations, routes, checkers };
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
