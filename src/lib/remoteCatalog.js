/* 远程基础数据更新：内容哈希、结构校验、增量合并（纯函数，便于单元测试）
   线上真源为 public/basic-data.json（可在 GitHub 网页直接编辑），
   应用启动时静默拉取并在内容变化时合入本地基础数据。 */

let idSeq = 0;
function nextId() {
  idSeq += 1;
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `remote-${Date.now()}-${idSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

// 递归按对象键排序后序列化，保证字段顺序不影响哈希
export function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

// FNV-1a 32 位哈希；忽略 updatedAt（仅展示用，避免改时间造成无意义重复合并）
export function hashCatalogData(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
  if (src && typeof src === 'object') delete src.updatedAt;
  let h = 0x811c9dc5;
  const str = canonicalStringify(src);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// 结构校验：必需数组字段齐全且站点/线路/驻站人非空
export function validateRemoteCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const requiredArrays = ['stations', 'routes', 'checkers'];
  const optionalArrays = ['fleets', 'drivers', 'conductors'];
  if (!requiredArrays.every((k) => Array.isArray(raw[k]))) return false;
  if (!optionalArrays.every((k) => raw[k] == null || Array.isArray(raw[k]))) return false;
  if (!raw.stations.length || !raw.routes.length || !raw.checkers.length) return false;
  return true;
}

// 把远程原始数据归一化为与本地 basicData 相同形态（不含 id）
export function normalizeRemoteCatalog(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const asObjects = (arr, extra = {}) =>
    (Array.isArray(arr) ? arr : [])
      .map((it) => {
        if (typeof it === 'string') return { name: it.trim(), ...extra };
        if (it && typeof it === 'object') {
          const name = String(it.name ?? '').trim();
          if (!name) return null;
          const out = { name, ...extra };
          Object.keys(extra).forEach((k) => {
            if (k === 'routeName') out.routeName = String(it.routeName ?? '').trim();
            else if (k === 'sortOrder') out.sortOrder = Number.isFinite(it.sortOrder) ? it.sortOrder : 0;
            else if (k === 'fleet') out.fleet = String(it.fleet ?? '').trim();
          });
          return out;
        }
        return null;
      })
      .filter(Boolean);
  const uniqueStrings = (arr) => {
    const seen = new Set();
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach((v) => {
      const s = String(v === null || v === undefined ? '' : v).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    });
    return out;
  };
  return {
    routes: asObjects(src.routes, { fleet: '' }),
    stations: asObjects(src.stations, { routeName: '', sortOrder: 0 }),
    plates: uniqueStrings(src.plates),
    inspectors: uniqueStrings(src.checkers),
    drivers: asObjects(src.drivers, { routeName: '' }),
    conductors: asObjects(src.conductors, { routeName: '' }),
    fleets: uniqueStrings((src.fleets || []).map((f) => (typeof f === 'string' ? f : f && f.name))),
  };
}

// 远程 fleets 对象（{name, routes[]}）→ 线路归属映射，用于给空归属线路补车队
export function buildFleetMap(remoteRaw) {
  const map = new Map();
  const fleets = remoteRaw && Array.isArray(remoteRaw.fleets) ? remoteRaw.fleets : [];
  fleets.forEach((f) => {
    if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name) return;
    (Array.isArray(f.routes) ? f.routes : []).forEach((r) => {
      const route = String(r || '').trim();
      if (route && !map.has(route)) map.set(route, f.name);
    });
  });
  return map;
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach((v) => {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  });
  return out;
}

// 按 key 对本地/远程做并集合并：远程同名覆盖字段（保留本地 id），本地独有保留，不删除
function upsert(localItems, remoteItems, keyOf, applyRemote) {
  const out = (localItems || []).map((it) => ({ ...it }));
  const index = new Map(out.map((it) => [keyOf(it), it]));
  (remoteItems || []).forEach((r) => {
    const key = keyOf(r);
    if (!key) return;
    const existing = index.get(key);
    if (existing) {
      Object.assign(existing, applyRemote(existing, r));
    } else {
      const item = applyRemote(undefined, r);
      index.set(key, item);
      out.push(item);
    }
  });
  return out;
}

/**
 * 增量合并：local 为当前本地 basicData，remote 为 normalizeRemoteCatalog 的结果，
 * fleetMap 为 buildFleetMap(原始远程数据) 的结果。返回新的 basicData 对象。
 * - routes/检查人(→inspectors)/车队/车号：按名称并集，远程同名覆盖字段；
 * - stations 按 name|routeName 为键，远程同名覆盖 sortOrder；
 * - drivers/conductors 按姓名，远程同名覆盖 routeName；
 * - 所有本地独有条目保留，不删除任何条目；记录数据不参与合并。
 */
export function mergeCatalogData(local, remote, fleetMap = new Map()) {
  const l = local && typeof local === 'object' ? local : {};
  const b = {
    routes: upsert(
      l.routes,
      remote.routes,
      (r) => String(r.name || '').trim(),
      (ex, r) => ({
        id: ex ? ex.id : nextId(),
        name: r.name,
        fleet: ex && ex.fleet ? ex.fleet : String(r.fleet || '').trim(),
      })
    ),
    stations: upsert(
      l.stations,
      remote.stations,
      (s) => String(s.name || '').trim() + '|' + String(s.routeName || '').trim(),
      (ex, s) => ({
        id: ex ? ex.id : nextId(),
        name: s.name,
        routeName: String(s.routeName || '').trim(),
        sortOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : ex ? ex.sortOrder : 0,
      })
    ),
    plates: uniqueStrings([...(l.plates || []), ...(remote.plates || [])]),
    inspectors: uniqueStrings([...(l.inspectors || []), ...(remote.inspectors || [])]),
    drivers: upsert(
      l.drivers,
      remote.drivers,
      (d) => String(d.name || '').trim(),
      (ex, d) => ({
        id: ex ? ex.id : nextId(),
        name: d.name,
        routeName: String(d.routeName || '').trim(),
      })
    ),
    conductors: upsert(
      l.conductors,
      remote.conductors,
      (c) => String(c.name || '').trim(),
      (ex, c) => ({
        id: ex ? ex.id : nextId(),
        name: c.name,
        routeName: String(c.routeName || '').trim(),
      })
    ),
    fleets: uniqueStrings([...(l.fleets || []), ...(remote.fleets || [])]),
  };
  // 为空的车队归属按远程 fleetMap 补一次，不覆盖手工维护的归属
  b.routes.forEach((r) => {
    if (!r.fleet && fleetMap.has(r.name)) r.fleet = fleetMap.get(r.name);
  });
  return b;
}
