#!/usr/bin/env node
/* 生成 public/line-map.json：驻站实时到站所需的「线路 + 方向 + 站点 → stopId」对照表。

   用法：
     node tools/build-line-map.js                 # 直连上游（api.shmaas.net）
     node tools/build-line-map.js --via <地址>    # 走自建代理（如 Cloudflare Worker 地址）
     node tools/build-line-map.js --base <地址>   # 自定义上游地址（调试用）
     node tools/build-line-map.js --only 1677路   # 只重跑指定线路（可逗号分隔）

   人工校对写 tools/line-map.overrides.json，脚本合并后输出，重跑不会丢失。
   原始接口是随申行 App 的未公开接口，脚本已做节流与重试，请勿高频反复运行。 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyOverrides, buildLineMap, summarizeLineMap } from './line-map-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASIC_DATA = path.join(ROOT, 'public', 'basic-data.json');
const LINE_MAP_OUT = path.join(ROOT, 'public', 'line-map.json');
const OVERRIDES_IN = path.join(ROOT, 'tools', 'line-map.overrides.json');

const CITY_CODE = '310100';
const DEFAULT_UPSTREAM = 'https://api.shmaas.net';
const THROTTLE_MS = 400; // 上游对短时间高频请求不友好，逐条串行 + 间隔
const MAX_RETRY = 3;

function parseArgs(argv) {
  const args = { via: '', base: '', only: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--via') args.via = String(argv[(i += 1)] || '').trim();
    else if (flag === '--base') args.base = String(argv[(i += 1)] || '').trim();
    else if (flag === '--only') {
      args.only = String(argv[(i += 1)] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function apiBase(args) {
  if (args.base) return args.base.replace(/\/+$/, '');
  if (args.via) return args.via.replace(/\/+$/, '') + '/api/bus';
  return DEFAULT_UPSTREAM;
}

function endpoint(base, upstreamPath, proxiedPath) {
  return base.endsWith('/api/bus') ? base + proxiedPath : base + upstreamPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Saic-CityCode': CITY_CODE,
          'User-Agent': 'bus-check-suite/line-map',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      if (json && json.errCode !== undefined && json.errCode !== 0) {
        throw new Error(`上游错误 ${json.errCode} ${json.errMsg || ''}`);
      }
      return json;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRY) await sleep(800 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('请求失败');
}

function extractLines(payload) {
  // 兼容两种形态：直连上游时是 { errCode, data } 包装，走代理时已经是内层数据
  const inner = payload && payload.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const items = [];
  const stops = inner.trafficStop || [];
  stops.forEach((item) => {
    (item.stopLineInfo || []).forEach((line) => items.push(line));
    if (item.lineInfo) items.push(item.lineInfo);
  });
  return items;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = apiBase(args);
  const searchUrl = endpoint(base, '/traffic/v2/querytrafficline', '/line-search');
  const detailUrl = endpoint(base, '/traffic/v1/querybusline', '/line-detail');

  const basicData = JSON.parse(await readFile(BASIC_DATA, 'utf8'));
  const allRoutes = (basicData.routes || []).map((r) => (typeof r === 'string' ? r : r.name)).filter(Boolean);
  const routes = args.only.length ? allRoutes.filter((r) => args.only.includes(r)) : allRoutes;
  const stations = basicData.stations || [];

  let overrides = { routes: [] };
  try {
    overrides = JSON.parse(await readFile(OVERRIDES_IN, 'utf8'));
  } catch {
    overrides = { routes: [] };
  }

  console.log(`数据源：${base}`);
  console.log(`线路：${routes.length} 条（有站点的线路参与生成）`);

  let lastAt = 0;
  async function throttled(fn) {
    const wait = THROTTLE_MS - (Date.now() - lastAt);
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  }

  const lineMap = await buildLineMap({
    routes,
    stations,
    onProgress: ({ index, total, routeName }) => {
      process.stdout.write(`\r[${index}/${total}] ${routeName}          `);
    },
    searchLine: (routeName) =>
      throttled(async () => extractLines(await postJson(searchUrl, { keywords: routeName, type: 0, pageNo: 1, pageSize: 20 }))),
    fetchStops: ({ lineId, lineName, direction }) =>
      throttled(async () => {
        const payload = await postJson(detailUrl, { lineId, lineName, direction: String(direction) });
        const inner = payload && payload.data && typeof payload.data === 'object' ? payload.data : payload;
        const busLine = (inner && inner.busLine) || null;
        return {
          upStartStop: (busLine && busLine.upStartStop) || '',
          upEndStop: (busLine && busLine.upEndStop) || '',
          stops: (busLine && busLine.stop) || [],
        };
      }),
  });
  process.stdout.write('\r');

  // --only 只重跑部分线路时，与已有结果合并，避免把其余线路冲掉
  if (args.only.length) {
    try {
      const existing = JSON.parse(await readFile(LINE_MAP_OUT, 'utf8'));
      const byName = new Map(lineMap.routes.map((r) => [r.routeName, r]));
      const merged = (existing.routes || []).map((r) => byName.get(r.routeName) || r);
      const known = new Set(merged.map((r) => r.routeName));
      lineMap.routes.forEach((r) => {
        if (!known.has(r.routeName)) merged.push(r);
      });
      lineMap.routes = merged;
    } catch {
      /* 没有旧文件时直接用本次结果 */
    }
  }

  applyOverrides(lineMap, overrides);
  lineMap.overridesApplied = overrides.routes ? overrides.routes.length : 0;

  const summary = summarizeLineMap(lineMap);
  console.log(`\n写入 ${path.relative(ROOT, LINE_MAP_OUT)}`);
  console.log(`匹配率：>=95% ${summary.full} 条，70-95% ${summary.mid} 条，<70% ${summary.low} 条，共 ${summary.total} 条`);
  const worst = summary.routes.filter((r) => r.rate < 0.95).slice(0, 12);
  if (worst.length) {
    console.log('需要人工校对的线路（写进 tools/line-map.overrides.json）：');
    worst.forEach((r) => console.log(`  ${r.routeName}\t${Math.round(r.rate * 100)}%`));
  }
  const failed = lineMap.routes.filter((r) => r.error);
  if (failed.length) {
    console.log('未取到数据的线路：');
    failed.forEach((r) => console.log(`  ${r.routeName}\t${r.error}`));
  }

  await writeFile(LINE_MAP_OUT, JSON.stringify(lineMap, null, 1) + '\n', 'utf8');
}

main().catch((e) => {
  console.error('\n生成失败：', e && e.message ? e.message : e);
  process.exitCode = 1;
});
