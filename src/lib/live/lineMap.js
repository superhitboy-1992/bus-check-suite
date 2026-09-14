/* 读取 public/line-map.json（由 tools/build-line-map.js 生成），
   提供「线路 + 站点 → 各方向的 stopId / 终点站」查询。 */
import { canonicalStationName } from '../catalogFormat';

let cachedMap = null;
let inflight = null;

export function resetLineMapCache() {
  cachedMap = null;
  inflight = null;
}

/** 首次调用拉取一次，之后走内存缓存；force 时绕过浏览器缓存重新取（设置页手动刷新用） */
export async function loadLineMap({ url = './line-map.json', fetchImpl, force = false } = {}) {
  if (cachedMap) return cachedMap;
  if (!inflight) {
    const doFetch = fetchImpl || globalThis.fetch;
    inflight = (async () => {
      if (typeof doFetch !== 'function') throw new Error('line-map: 无可用 fetch');
      const target = force ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : url;
      const res = await doFetch(target);
      if (!res || !res.ok) throw new Error(`line-map: HTTP ${res && res.status}`);
      const json = await res.json();
      cachedMap = json && typeof json === 'object' ? json : { routes: [] };
      return cachedMap;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 把映射整理成便于查询的索引 */
export function buildLineMapIndex(lineMap) {
  const byRoute = new Map();
  const routes = (lineMap && Array.isArray(lineMap.routes) ? lineMap.routes : []).filter(Boolean);
  routes.forEach((route) => {
    const name = String(route.routeName || '').trim();
    if (!name) return;
    const directions = new Map();
    (Array.isArray(route.directions) ? route.directions : []).forEach((dir) => {
      const upDown = Number(dir && dir.upDown);
      if (!Number.isFinite(upDown)) return;
      const byName = new Map();
      (Array.isArray(dir.localMatches) ? dir.localMatches : []).forEach((m) => {
        if (!m || !m.localName || !m.stopId || m.match === 'missing') return;
        byName.set(canonicalStationName(m.localName), {
          stopId: String(m.stopId),
          apiName: String(m.apiName || m.localName),
          match: String(m.match || ''),
        });
      });
      directions.set(upDown, {
        upDown,
        startStop: String(dir.startStop || ''),
        endStop: String(dir.endStop || ''),
        byName,
      });
    });
    byRoute.set(name, {
      routeName: name,
      lineId: String(route.lineId || ''),
      directions,
    });
  });
  return {
    updatedAt: String((lineMap && lineMap.updatedAt) || ''),
    routeCount: byRoute.size,
    byRoute,
  };
}

/**
 * 查某条线路经过某站点时，各方向的站点信息。
 * @returns {Array<{upDown: number, stopId: string, apiName: string, toward: string, startStop: string}>}
 */
export function findStops(index, routeName, stationName) {
  const route = index && index.byRoute ? index.byRoute.get(String(routeName || '').trim()) : null;
  if (!route) return [];
  const key = canonicalStationName(stationName);
  const out = [];
  Array.from(route.directions.values())
    .sort((a, b) => a.upDown - b.upDown)
    .forEach((dir) => {
      const hit = dir.byName.get(key);
      if (!hit) return;
      out.push({
        upDown: dir.upDown,
        stopId: hit.stopId,
        apiName: hit.apiName,
        toward: dir.endStop || '',
        startStop: dir.startStop || '',
      });
    });
  return out;
}

/** 某条线路在映射里是否有数据（用于区分"未匹配"和"线路不存在"） */
export function hasRoute(index, routeName) {
  return Boolean(index && index.byRoute && index.byRoute.has(String(routeName || '').trim()));
}
