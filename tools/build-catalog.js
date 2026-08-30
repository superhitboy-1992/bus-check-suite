/* 从 database/*.xlsx 与《车队线路信息.xlsx》重新生成 src/data/catalogSeed.js（内置初始资料库）
   database/司售人员名单.xlsx 提供驾驶员/售票员内置名单（含「科室/线路」列生成的线路归属）
   用法：node tools/build-catalog.js
   依赖：项目内 npm 包 xlsx 与 src/lib/stationImport.js（同一套解析逻辑） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseFile, parseStaff } from '../src/lib/stationImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readRows(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
}

// 线路名历史替换：老名单里的旧名称统一改为《车队线路信息.xlsx》里的新名称
const RENAME_MAP = { DZ乐张线: '乐张专线', '廊下3路A': '廊下3路', '廊下3路B': '廊下3路' };

// 《车队线路信息.xlsx》：第一行为车队名，每列向下为该车队线路
function readFleets(file) {
  const rows = readRows(file);
  const fleets = [];
  if (!rows.length) return fleets;
  rows[0].forEach((cell, ci) => {
    const name = String(cell || '').trim();
    if (!name) return;
    const routes = [];
    for (let ri = 1; ri < rows.length; ri++) {
      const v = String(rows[ri][ci] || '').trim();
      if (v && routes.indexOf(v) < 0) routes.push(v);
    }
    fleets.push({ name, routes });
  });
  return fleets;
}

// 合并线路名单：应用改名映射、去重，保持出现顺序
function mergeRoutes(...lists) {
  const seen = {};
  const out = [];
  lists.forEach((list) => {
    (list || []).forEach((r) => {
      const v = RENAME_MAP[r] || r;
      if (v && !seen[v]) {
        seen[v] = 1;
        out.push(v);
      }
    });
  });
  return out;
}

const stationFile = path.join(ROOT, 'database', '各线路站点.xlsx');
const checkerFile = path.join(ROOT, 'database', '驻站人姓名.xlsx');
const fleetFile = path.join(ROOT, '车队线路信息.xlsx');
const staffFile = path.join(ROOT, 'database', '司售人员名单.xlsx');

const fromStations = parseFile(readRows(stationFile));
const fromCheckers = parseFile(readRows(checkerFile));
const fleetSeed = fs.existsSync(fleetFile) ? readFleets(fleetFile) : [];
const staff = fs.existsSync(staffFile)
  ? parseStaff(readRows(staffFile))
  : { drivers: [], conductors: [] };
if (!fs.existsSync(staffFile)) {
  console.warn('警告：缺少 database/司售人员名单.xlsx，驾驶员/售票员内置名单为空');
}
const fleetRoutes = [];
fleetSeed.forEach((f) => fleetRoutes.push(...f.routes));

const seed = {
  stations: fromStations.stations,
  routes: mergeRoutes(fromStations.routes, fleetRoutes),
  checkers: fromCheckers.checkers,
  fleets: fleetSeed,
  drivers: staff.drivers,
  conductors: staff.conductors,
};

if (!seed.stations.length || !seed.routes.length || !seed.checkers.length) {
  console.error('生成失败：解析结果为空', {
    stations: seed.stations.length,
    routes: seed.routes.length,
    checkers: seed.checkers.length,
  });
  process.exit(1);
}

const json = JSON.stringify(seed, null, 0)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e');

const out = [
  '/* 内置初始资料库：由 database/*.xlsx 与《车队线路信息.xlsx》生成，请勿手改；',
  '   更新 Excel 后运行 node tools/build-catalog.js 重新生成 */',
  'export const CatalogSeed = ' + json + ';',
  '',
].join('\n');

const outFile = path.join(ROOT, 'src', 'data', 'catalogSeed.js');
fs.writeFileSync(outFile, out, 'utf8');
console.log(
  '已生成 src/data/catalogSeed.js：站点', seed.stations.length,
  '线路', seed.routes.length,
  '驻站人', seed.checkers.length,
  '驾驶员', seed.drivers.length,
  '售票员', seed.conductors.length
);
