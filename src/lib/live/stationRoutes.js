/* 站点 → 经过线路 的反查：直接用基础数据里「线路 + 站名」的归属关系，
   不需要额外维护一份对照表（730 个站名里有 206 个是多线共站）。 */
import { canonicalStationName } from '../catalogFormat';

/**
 * @param {Array<{name: string, routeName?: string, retired?: boolean}>} stations 基础数据站点
 * @param {string} stationName 站名
 * @param {{includeRetired?: boolean}} [options]
 * @returns {string[]} 经过该站点的线路名（按基础数据顺序去重）
 */
export function routesServingStation(stations, stationName, { includeRetired = false } = {}) {
  const target = canonicalStationName(stationName);
  if (!target) return [];
  const seen = new Set();
  const out = [];
  (Array.isArray(stations) ? stations : []).forEach((s) => {
    if (!s) return;
    if (!includeRetired && s.retired === true) return;
    if (canonicalStationName(s.name) !== target) return;
    const routeName = String(s.routeName || '').trim();
    if (!routeName || seen.has(routeName)) return;
    seen.add(routeName);
    out.push(routeName);
  });
  return out;
}
