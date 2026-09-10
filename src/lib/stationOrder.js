/* 站点排序：线路顺序 → 线路内站序（sortOrder）→ 原有相对顺序。
   线上基础数据是并集合并的：老站保留在本地数组原位、sortOrder 被远程覆盖，
   新增站追加到数组末尾。因此选择器不能再按数组顺序展示，必须按站序重排，
   否则更新后「选站点」的顺序会乱。 */

const UNKNOWN_ROUTE = Number.MAX_SAFE_INTEGER;

function routeOrderMap(routes) {
  const map = new Map();
  (routes || []).forEach((r, i) => {
    const name = typeof r === 'string' ? r.trim() : String((r && r.name) || '').trim();
    if (name && !map.has(name)) map.set(name, i);
  });
  return map;
}

function routePosition(item, order) {
  const name = String((item && item.routeName) || '').trim();
  if (!name) return UNKNOWN_ROUTE; // 通用站点（未归线路）排最后
  const i = order.get(name);
  return i === undefined ? UNKNOWN_ROUTE : i; // 本地手工线路不在名单里时同样排最后
}

function orderOf(item) {
  return item && Number.isFinite(item.sortOrder) ? item.sortOrder : 0;
}

// 排序比较器：线路位置 → sortOrder 升序；完全相同时返回 0（由调用方保持原有相对顺序）
export function createStationComparator(routes) {
  const order = routeOrderMap(routes);
  return (a, b) => {
    const pa = routePosition(a, order);
    const pb = routePosition(b, order);
    if (pa !== pb) return pa - pb;
    return orderOf(a) - orderOf(b);
  };
}

// 返回按线路 + 站序排好的副本，不改写入参
export function sortStationsByRoute(stations, routes) {
  const compare = createStationComparator(routes);
  return (stations || [])
    .map((item, index) => ({ item, index }))
    .sort((x, y) => compare(x.item, y.item) || x.index - y.index)
    .map((x) => x.item);
}

/**
 * 选择器用的站点名列表：过滤已停用站点，按线路 + 站序排序后按站名去重（保留首次出现位置）。
 * - routeName 传线路名时只取该线路的站点，否则取全部（按线路分组）；
 * - includeRetired 为 true 时保留已停用站点（基础数据页用）。
 */
export function stationNameOptions(stations, routes, { routeName = '', includeRetired = false } = {}) {
  const route = String(routeName || '').trim();
  const list = sortStationsByRoute(
    (stations || []).filter((s) => {
      if (!s) return false;
      if (!includeRetired && s.retired === true) return false;
      if (route && String(s.routeName || '').trim() !== route) return false;
      return true;
    }),
    routes
  );
  const seen = new Set();
  const out = [];
  list.forEach((s) => {
    const name = String(s.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  });
  return out;
}
