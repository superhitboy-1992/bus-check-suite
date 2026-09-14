/* 线路站点映射的纯逻辑（便于单元测试）：
   把「随申行」接口返回的站点名与我们基础数据里的站名做匹配，
   生成驻站实时到站需要的 (线路, 方向, 站点) → stopId 对照表。

   站名差异主要来自：全角/半角括号、「（招呼站）」这类括号内容、
   「单向/双向」后缀、以及少量站名改名，因此匹配前先做归一化，
   精确匹配不上时再做一次包含匹配（标记 fuzzy）。 */

/** 站名归一化：全角括号转半角 → 去掉括号内容 → 去掉方向/招呼站后缀 → 去空白 */
export function normalizeStationName(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/^\*+/, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/\([^)]*\)/g, '')
    .replace(/[（(][^（()）]*[）)]/g, '')
    .replace(/(招呼站|单向|双向)/g, '')
    .replace(/[\s\u3000]+/g, '');
}

/**
 * 把本地站名列表匹配到接口站点列表。
 * @param {string[]} localNames 本地站名（按站序）
 * @param {Array<{stopId: string|number, stopName?: string, name?: string}>} apiStops 接口站点（按站序）
 * @returns {{matches: Array<object>, matched: number, total: number, rate: number}}
 */
export function matchStationNames(localNames, apiStops) {
  const pool = (Array.isArray(apiStops) ? apiStops : []).map((s, index) => ({
    index,
    stopId: String(s && s.stopId !== undefined && s.stopId !== null ? s.stopId : ''),
    apiName: String((s && (s.stopName || s.name)) || ''),
    norm: normalizeStationName(s && (s.stopName || s.name)),
  }));
  const used = new Set();
  const matches = [];

  (Array.isArray(localNames) ? localNames : []).forEach((localName) => {
    const norm = normalizeStationName(localName);
    let hit = norm ? pool.find((p) => !used.has(p.index) && p.norm === norm) : null;
    let match = 'exact';
    if (!hit && norm.length >= 3) {
      // 包含匹配兜底：例如本地「思源路叶新公路(招呼站)」与接口「思源路叶新公路」
      hit = pool.find(
        (p) =>
          !used.has(p.index) &&
          p.norm &&
          (p.norm.includes(norm) || norm.includes(p.norm)) &&
          Math.min(p.norm.length, norm.length) >= 3
      );
      match = 'fuzzy';
    }
    if (hit) used.add(hit.index);
    matches.push({
      localName: String(localName || ''),
      stopId: hit ? hit.stopId : '',
      apiName: hit ? hit.apiName : '',
      seq: hit ? hit.index + 1 : 0,
      match: hit ? match : 'missing',
    });
  });

  const matched = matches.filter((m) => m.match !== 'missing').length;
  const total = matches.length;
  return { matches, matched, total, rate: total ? matched / total : 0 };
}

/**
 * 生成整份线路映射。
 * @param {object} options
 * @param {string[]} options.routes 线路名列表（按基础数据顺序）
 * @param {Array<{name: string, routeName: string, sortOrder?: number}>} options.stations 站点列表
 * @param {(routeName: string) => Promise<Array<object>>} options.searchLine 线路搜索
 * @param {(params: {lineId: string, lineName: string, direction: number}) => Promise<{upStartStop?: string, upEndStop?: string, stops?: Array<object>}>} options.fetchStops 取某方向站点
 * @param {(info: {index: number, total: number, routeName: string}) => void} [options.onProgress]
 */
export async function buildLineMap({ routes, stations, searchLine, fetchStops, onProgress }) {
  const list = Array.isArray(routes) ? routes : [];
  const stationList = Array.isArray(stations) ? stations : [];
  const out = [];
  let index = 0;

  for (const routeName of list) {
    const localNames = stationList
      .filter((s) => s && s.routeName === routeName)
      .slice()
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      .map((s) => String(s.name || ''));
    const routeTotal = list.filter((name) =>
      stationList.some((s) => s && s.routeName === name)
    ).length;
    if (!localNames.length) continue;
    index += 1;
    if (typeof onProgress === 'function') onProgress({ index, total: routeTotal, routeName });

    let found = [];
    try {
      found = (await searchLine(routeName)) || [];
    } catch (e) {
      out.push({ routeName, error: 'search_failed', directions: [], localTotal: localNames.length });
      continue;
    }
    const pick = found.find((x) => x && x.lineName === routeName) || found[0];
    if (!pick || !pick.lineId) {
      out.push({ routeName, error: 'line_not_found', directions: [], localTotal: localNames.length });
      continue;
    }

    const directions = [];
    for (const upDown of [0, 1]) {
      let detail = null;
      try {
        detail = await fetchStops({ lineId: String(pick.lineId), lineName: pick.lineName || routeName, direction: upDown });
      } catch (e) {
        detail = null;
      }
      const stops = (detail && detail.stops) || [];
      const coverage = matchStationNames(localNames, stops);
      directions.push({
        upDown,
        startStop: (detail && detail.upStartStop) || '',
        endStop: (detail && detail.upEndStop) || '',
        coverage: { matched: coverage.matched, total: coverage.total, rate: Number(coverage.rate.toFixed(4)) },
        localMatches: coverage.matches,
        stops: stops.map((s, i) => ({
          seq: i + 1,
          name: String((s && (s.stopName || s.name)) || ''),
          stopId: String(s && s.stopId !== undefined && s.stopId !== null ? s.stopId : ''),
        })),
      });
    }

    const best = directions.reduce(
      (acc, d) => (d.coverage.rate > acc.rate ? { rate: d.coverage.rate, matched: d.coverage.matched } : acc),
      { rate: -1, matched: 0 }
    );
    out.push({
      routeName,
      lineId: String(pick.lineId),
      lineName: String(pick.lineName || routeName),
      localTotal: localNames.length,
      bestRate: Number(best.rate.toFixed(4)),
      bestMatched: best.matched,
      directions,
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    source: 'api.shmaas.net',
    routes: out,
  };
}

/**
 * 合并人工校对结果。override 形如：
 *   { routes: [{ routeName, lineId?, upDown, localName, stopId, apiName? }] }
 * 命中不到已有条目时按方向追加，`match` 标记为 manual，重跑脚本不会丢失。
 */
export function applyOverrides(lineMap, overrides) {
  const list = overrides && Array.isArray(overrides.routes) ? overrides.routes : [];
  if (!list.length || !lineMap || !Array.isArray(lineMap.routes)) return lineMap;
  const manual = {};

  list.forEach((ov) => {
    if (!ov || !ov.routeName || ov.upDown === undefined || ov.upDown === null) return;
    const key = String(ov.routeName);
    if (!manual[key]) manual[key] = [];
    manual[key].push(ov);
  });

  Object.keys(manual).forEach((routeName) => {
    let route = lineMap.routes.find((r) => r.routeName === routeName);
    if (!route) {
      route = { routeName, lineId: '', lineName: routeName, directions: [], localTotal: 0, bestRate: 0 };
      lineMap.routes.push(route);
    }
    manual[routeName].forEach((ov) => {
      if (ov.lineId) route.lineId = String(ov.lineId);
      const upDown = Number(ov.upDown);
      let dir = route.directions.find((d) => d.upDown === upDown);
      if (!dir) {
        dir = { upDown, startStop: '', endStop: '', coverage: { matched: 0, total: 0, rate: 0 }, localMatches: [], stops: [] };
        route.directions.push(dir);
        route.directions.sort((a, b) => a.upDown - b.upDown);
      }
      const localName = String(ov.localName || '');
      let item = dir.localMatches.find((m) => m.localName === localName);
      if (!item) {
        item = { localName, stopId: '', apiName: '', seq: 0, match: 'manual' };
        dir.localMatches.push(item);
      }
      item.stopId = String(ov.stopId || '');
      item.apiName = String(ov.apiName || item.apiName || '');
      item.match = 'manual';
    });
  });

  lineMap.routes.forEach((route) => {
    route.directions.forEach((dir) => {
      const matched = dir.localMatches.filter((m) => m.match !== 'missing' && m.stopId).length;
      dir.coverage = { matched, total: route.localTotal || dir.localMatches.length, rate: route.localTotal ? Number((matched / route.localTotal).toFixed(4)) : 0 };
    });
    const best = route.directions.reduce(
      (acc, d) => (d.coverage.rate > acc.rate ? { rate: d.coverage.rate, matched: d.coverage.matched } : acc),
      { rate: -1, matched: 0 }
    );
    route.bestRate = Number(Math.max(0, best.rate).toFixed(4));
    route.bestMatched = best.matched;
  });

  return lineMap;
}

/** 汇总报告：返回按匹配率升序的线路列表与总体统计 */
export function summarizeLineMap(lineMap) {
  const routes = ((lineMap && lineMap.routes) || [])
    .filter((r) => r && r.directions && r.directions.length)
    .map((r) => ({ routeName: r.routeName, rate: r.bestRate || 0, localTotal: r.localTotal || 0 }))
    .sort((a, b) => a.rate - b.rate);
  const full = routes.filter((r) => r.rate >= 0.95).length;
  const mid = routes.filter((r) => r.rate >= 0.7 && r.rate < 0.95).length;
  const low = routes.filter((r) => r.rate < 0.7).length;
  return { routes, full, mid, low, total: routes.length };
}
