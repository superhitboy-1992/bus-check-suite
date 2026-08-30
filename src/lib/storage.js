import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, DATA_VERSION } from './constants';
import { CatalogSeed } from '../data/catalogSeed';
import {
  buildFleetMap,
  hashCatalogData,
  mergeCatalogData,
  normalizeRemoteCatalog,
  validateRemoteCatalog,
} from './remoteCatalog';

const DRAFT_KEY = STORAGE_KEYS.draft;
const LEGACY_INSPECTORS_KEY = 'busCheck.inspectors';
const SEEDED_KEY = 'busCheck.seeded.v2';
const REMOTE_CATALOG_KEY = 'busCheck.basicDataRemote';
const CATALOG_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 页面重新可见时最多每小时检查一次
const INSPECTORS_MAX = 20;
const STORAGE_WARN_BYTES = 4 * 1024 * 1024; // 4MB

let lastCatalogCheckAt = 0;
let catalogCheckInFlight = null;

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function normalizeObjects(arr, extra) {
  const seen = new Set();
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach((it) => {
    if (typeof it === 'string') {
      const name = it.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push({ id: uid(), name, ...extra });
      }
      return;
    }
    if (it && typeof it === 'object') {
      const name = String(it.name ?? '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      out.push({ id: it.id || uid(), name, ...extra, ...it });
    }
  });
  return out;
}

function normalizeRoutes(arr) {
  return normalizeObjects(arr, { fleet: '' }).map((r) => ({
    id: r.id,
    name: r.name,
    fleet: String(r.fleet || '').trim(),
  }));
}

function normalizeStations(arr) {
  const seen = new Set();
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach((it) => {
    if (typeof it === 'string') {
      const name = it.trim();
      const key = name + '|';
      if (name && !seen.has(key)) {
        seen.add(key);
        out.push({ id: uid(), name, routeName: '', sortOrder: 0 });
      }
      return;
    }
    if (it && typeof it === 'object') {
      const name = String(it.name ?? '').trim();
      const routeName = String(it.routeName || '').trim();
      const key = name + '|' + routeName;
      if (!name || seen.has(key)) return;
      seen.add(key);
      out.push({
        id: it.id || uid(),
        name,
        routeName,
        sortOrder: Number.isFinite(it.sortOrder) ? it.sortOrder : 0,
      });
    }
  });
  return out;
}

function normalizeStaff(arr) {
  return normalizeObjects(arr, { routeName: '' }).map((s) => ({
    id: s.id,
    name: s.name,
    routeName: String(s.routeName || '').trim(),
  }));
}

function emptyBasicData() {
  return {
    routes: [],
    stations: [],
    plates: [],
    inspectors: [],
    drivers: [],
    conductors: [],
    fleets: [],
  };
}

function normalizeBasicData(b) {
  const src = b && typeof b === 'object' ? b : {};
  return {
    routes: normalizeRoutes(src.routes),
    stations: normalizeStations(src.stations),
    plates: uniqueStrings(src.plates),
    inspectors: uniqueStrings(src.inspectors),
    drivers: normalizeStaff(src.drivers),
    conductors: normalizeStaff(src.conductors),
    fleets: uniqueStrings(src.fleets),
  };
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function load() {
  let records = [];
  let stationRecords = [];
  try {
    records = JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || '[]');
    if (!Array.isArray(records)) records = [];
  } catch {
    records = [];
  }
  try {
    stationRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.stationRecords) || '[]');
    if (!Array.isArray(stationRecords)) stationRecords = [];
  } catch {
    stationRecords = [];
  }
  const basicData = normalizeBasicData(loadJSON(STORAGE_KEYS.basicData, {}));
  // 迁移旧版检查人历史（v1 单独键）
  const legacy = loadJSON(LEGACY_INSPECTORS_KEY, []);
  if (Array.isArray(legacy) && legacy.length) {
    basicData.inspectors = uniqueStrings([...basicData.inspectors, ...legacy]);
  }
  return { records, stationRecords, basicData };
}

let state = load();

const listeners = new Set();
const pressureListeners = new Set();
let lastDeleted = null;

function computeStorageUsageBytes() {
  let total = 0;
  try {
    [STORAGE_KEYS.records, STORAGE_KEYS.stationRecords, STORAGE_KEYS.basicData].forEach((k) => {
      total += new Blob([localStorage.getItem(k) || '[]']).size;
    });
  } catch {
    total = 0;
  }
  return { total };
}

let pressureState = {
  overLimit: computeStorageUsageBytes().total > STORAGE_WARN_BYTES,
  quotaFailed: false,
};

function setPressure(next) {
  if (pressureState.overLimit === next.overLimit && pressureState.quotaFailed === next.quotaFailed) return;
  pressureState = next;
  pressureListeners.forEach((fn) => fn());
}

function subscribePressure(fn) {
  pressureListeners.add(fn);
  return () => pressureListeners.delete(fn);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(state.records));
    localStorage.setItem(STORAGE_KEYS.stationRecords, JSON.stringify(state.stationRecords));
    localStorage.setItem(STORAGE_KEYS.basicData, JSON.stringify(state.basicData));
    localStorage.setItem(STORAGE_KEYS.version, String(DATA_VERSION));
    setPressure({ overLimit: computeStorageUsageBytes().total > STORAGE_WARN_BYTES, quotaFailed: false });
  } catch (e) {
    console.error('保存数据失败', e);
    setPressure({
      overLimit: pressureState.overLimit,
      quotaFailed: Boolean(e && (e.name === 'QuotaExceededError' || e.code === 22)),
    });
  }
}

function emit() {
  save();
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (
      e.key === STORAGE_KEYS.records ||
      e.key === STORAGE_KEYS.stationRecords ||
      e.key === STORAGE_KEYS.basicData ||
      e.key === STORAGE_KEYS.version
    ) {
      state = load();
      emit();
    }
  });
}

// ---------- 首启内置资料库种子（只填充缺失项，不覆盖用户数据） ----------
function seedCatalogIfNeeded() {
  try {
    if (localStorage.getItem(SEEDED_KEY) === '1') return;
  } catch {
    return;
  }
  if (!CatalogSeed) return;
  const seed = CatalogSeed;
  const b = state.basicData;
  const routeMap = new Map(b.routes.map((r) => [r.name, r]));
  (seed.routes || []).forEach((name) => {
    if (!routeMap.has(name)) {
      const r = { id: uid(), name, fleet: '' };
      routeMap.set(name, r);
      b.routes.push(r);
    }
  });
  const fleetSet = new Set(b.fleets);
  (seed.fleets || []).forEach((f) => {
    if (!fleetSet.has(f.name)) {
      fleetSet.add(f.name);
      b.fleets.push(f.name);
    }
  });
  (seed.fleets || []).forEach((f) => {
    (f.routes || []).forEach((name) => {
      const r = routeMap.get(name);
      if (r && !r.fleet) r.fleet = f.name;
    });
  });
  const stationKeys = new Set(b.stations.map((s) => s.name + '|' + s.routeName));
  (seed.stations || []).forEach((s) => {
    const name = typeof s === 'string' ? s.trim() : String((s && s.name) || '').trim();
    if (!name) return;
    const routeName = s && typeof s === 'object' ? String(s.routeName || '').trim() : '';
    const sortOrder = s && typeof s === 'object' && Number.isFinite(s.sortOrder) ? s.sortOrder : 0;
    const key = name + '|' + routeName;
    if (!stationKeys.has(key)) {
      stationKeys.add(key);
      b.stations.push({ id: uid(), name, routeName, sortOrder });
    }
  });
  const inspectorSet = new Set(b.inspectors);
  (seed.checkers || []).forEach((name) => {
    if (!inspectorSet.has(name)) {
      inspectorSet.add(name);
      b.inspectors.push(name);
    }
  });
  const driverNames = new Set(b.drivers.map((d) => d.name));
  (seed.drivers || []).forEach((s) => {
    const name = String((s && s.name !== undefined ? s.name : s) || '').trim();
    if (!name || driverNames.has(name)) return;
    driverNames.add(name);
    b.drivers.push({ id: uid(), name, routeName: String((s && s.routeName) || '').trim() });
  });
  const conductorNames = new Set(b.conductors.map((c) => c.name));
  (seed.conductors || []).forEach((s) => {
    const name = String((s && s.name !== undefined ? s.name : s) || '').trim();
    if (!name || conductorNames.has(name)) return;
    conductorNames.add(name);
    b.conductors.push({ id: uid(), name, routeName: String((s && s.routeName) || '').trim() });
  });
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    /* 存储不可用时忽略 */
  }
  emit();
}

seedCatalogIfNeeded();

// ---------- 旧数据一次性补线路归属 ----------
// 新版内置名单带线路归属，但旧安装的 localStorage 里司机/售票员 routeName 为空；
// 迁移按姓名从内置名单补一次空归属（不覆盖手工维护），且只执行一次，避免后续手动清空被覆盖。
const STAFF_ROUTES_MIGRATION_KEY = 'busCheck.staffRoutes.v1';

function migrateStaffRoutes() {
  try {
    if (localStorage.getItem(STAFF_ROUTES_MIGRATION_KEY) === '1') return;
  } catch {
    return;
  }
  if (!CatalogSeed) return;
  const driverMap = new Map(
    (CatalogSeed.drivers || []).map((s) => [
      String((s && s.name) || '').trim(),
      String((s && s.routeName) || '').trim(),
    ])
  );
  const conductorMap = new Map(
    (CatalogSeed.conductors || []).map((s) => [
      String((s && s.name) || '').trim(),
      String((s && s.routeName) || '').trim(),
    ])
  );
  const b = state.basicData;
  let changed = false;
  b.drivers.forEach((d) => {
    const route = driverMap.get(d.name);
    if (!d.routeName && route) {
      d.routeName = route;
      changed = true;
    }
  });
  b.conductors.forEach((c) => {
    const route = conductorMap.get(c.name);
    if (!c.routeName && route) {
      c.routeName = route;
      changed = true;
    }
  });
  try {
    localStorage.setItem(STAFF_ROUTES_MIGRATION_KEY, '1');
  } catch {
    /* 存储不可用时忽略 */
  }
  if (changed) emit();
}

migrateStaffRoutes();

// ---------- 旧数据一次性补站点线路归属 ----------
// 新版内置资料带站点线路归属，但旧安装的 localStorage 里站点 routeName 为空；
// 迁移按站名从内置资料补一次归属（一站多线时生成多条），不覆盖手工维护的线路，
// 且只执行一次，避免后续手动清空被覆盖。
const STATION_ROUTES_MIGRATION_KEY = 'busCheck.stationRoutes.v1';

function migrateStationRoutes() {
  try {
    if (localStorage.getItem(STATION_ROUTES_MIGRATION_KEY) === '1') return;
  } catch {
    return;
  }
  if (!CatalogSeed) return;
  const byName = new Map(); // 站名 -> [{ routeName, sortOrder }]
  (CatalogSeed.stations || []).forEach((s) => {
    const name = typeof s === 'string' ? s.trim() : String((s && s.name) || '').trim();
    if (!name) return;
    const routeName = s && typeof s === 'object' ? String(s.routeName || '').trim() : '';
    if (!routeName) return;
    const sortOrder = s && typeof s === 'object' && Number.isFinite(s.sortOrder) ? s.sortOrder : 0;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ routeName, sortOrder });
  });
  const b = state.basicData;
  const existing = new Set(b.stations.map((s) => s.name + '|' + s.routeName));
  let changed = false;
  const next = [];
  b.stations.forEach((s) => {
    // 只转换完全无归属且能匹配内置资料的通用站点；已手工维护线路的保持原样
    if (s.routeName || !byName.has(s.name)) {
      next.push(s);
      return;
    }
    byName.get(s.name).forEach((r) => {
      const key = s.name + '|' + r.routeName;
      if (existing.has(key)) return; // 该线路记录已存在（手工维护），不重复添加
      existing.add(key);
      next.push({ id: uid(), name: s.name, routeName: r.routeName, sortOrder: r.sortOrder });
      changed = true;
    });
  });
  b.stations = next;
  try {
    localStorage.setItem(STATION_ROUTES_MIGRATION_KEY, '1');
  } catch {
    /* 存储不可用时忽略 */
  }
  if (changed) emit();
}

migrateStationRoutes();

// ---------- 远程基础数据自动更新 ----------
// 线上真源为 public/basic-data.json（仓库内、可在 GitHub 网页编辑、随站点发布）。
// 每次启动与页面重新可见时（节流）拉取一次：内容哈希有变化则增量合并，
// 远程同名条目覆盖、本地独有条目保留、不删除、不动检查记录；失败静默跳过。

function loadRemoteCatalogMeta() {
  try {
    const raw = localStorage.getItem(REMOTE_CATALOG_KEY);
    return raw ? JSON.parse(raw) : { hash: '', appliedAt: 0, updatedAt: '' };
  } catch {
    return { hash: '', appliedAt: 0, updatedAt: '' };
  }
}

function notifyCatalogUpdated(updatedAt) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const date = typeof updatedAt === 'string' && updatedAt ? updatedAt.slice(0, 10) : '';
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: { message: date ? `基础数据已更新（${date}）` : '基础数据已更新', type: 'success' },
    })
  );
}

export async function checkForCatalogUpdate() {
  if (typeof fetch !== 'function') return null;
  let raw;
  try {
    const res = await fetch('./basic-data.json', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    raw = await res.json();
  } catch (e) {
    console.warn('基础数据更新检查失败（忽略）', e);
    return null;
  }
  if (!validateRemoteCatalog(raw)) return null;
  const hash = hashCatalogData(raw);
  const meta = loadRemoteCatalogMeta();
  if (meta.hash === hash) return null;
  const remote = normalizeRemoteCatalog(raw);
  const merged = mergeCatalogData(state.basicData, remote, buildFleetMap(raw));
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
  state = { ...state, basicData: merged };
  try {
    localStorage.setItem(REMOTE_CATALOG_KEY, JSON.stringify({ hash, appliedAt: Date.now(), updatedAt }));
  } catch (e) {
    console.warn('保存基础数据更新标记失败', e);
  }
  emit();
  notifyCatalogUpdated(updatedAt);
  return { hash, updatedAt };
}

// 应用启动时调用一次，并监听页面重新可见时再次检查（节流）
export function initCatalogAutoUpdate() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const run = () => {
    const now = Date.now();
    if (now - lastCatalogCheckAt < CATALOG_CHECK_INTERVAL_MS) return;
    lastCatalogCheckAt = now;
    if (!catalogCheckInFlight) {
      catalogCheckInFlight = checkForCatalogUpdate().finally(() => {
        catalogCheckInFlight = null;
      });
    }
  };
  run();
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}

// ---------- 跳车记录 ----------
export function useRecords() {
  return useSyncExternalStore(subscribe, () => state.records);
}

export function getRecords() {
  return state.records;
}

export function createRecord(data) {
  const now = new Date().toISOString();
  const record = { id: uid(), ...data, createdAt: now, updatedAt: now };
  state = { ...state, records: [record, ...state.records] };
  emit();
  return record;
}

export function updateRecord(id, data) {
  state = {
    ...state,
    records: state.records.map((r) => (r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r)),
  };
  emit();
}

export function deleteRecord(id) {
  const target = state.records.find((r) => r.id === id);
  if (target) lastDeleted = { ...target };
  state = { ...state, records: state.records.filter((r) => r.id !== id) };
  emit();
}

export function restoreLastDeleted() {
  if (!lastDeleted) return null;
  const restored = lastDeleted;
  lastDeleted = null;
  state = { ...state, records: [restored, ...state.records] };
  emit();
  return restored;
}

export function hasLastDeleted() {
  return Boolean(lastDeleted);
}

// ---------- 驻站记录 ----------
export function useStationRecords() {
  return useSyncExternalStore(subscribe, () => state.stationRecords);
}

export function getStationRecords() {
  return state.stationRecords;
}

export function createStationRecord(data) {
  const now = new Date().toISOString();
  const record = { id: uid(), ...data, createdAt: now };
  state = { ...state, stationRecords: [record, ...state.stationRecords] };
  emit();
  return record;
}

export function updateStationRecord(id, data) {
  state = {
    ...state,
    stationRecords: state.stationRecords.map((r) =>
      r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
    ),
  };
  emit();
}

export function deleteStationRecord(id) {
  state = { ...state, stationRecords: state.stationRecords.filter((r) => r.id !== id) };
  emit();
}

// ---------- 共享基础数据 ----------
export function useBasicData() {
  return useSyncExternalStore(subscribe, () => state.basicData);
}

export function getBasicData() {
  return state.basicData;
}

export function addBasicItem(type, item) {
  const listKey = `${type}s`;
  const next = { id: uid(), ...item };
  state = { ...state, basicData: { ...state.basicData, [listKey]: [...state.basicData[listKey], next] } };
  emit();
  return next;
}

export function updateBasicItem(type, id, patch) {
  const listKey = `${type}s`;
  state = {
    ...state,
    basicData: {
      ...state.basicData,
      [listKey]: state.basicData[listKey].map((it) => (it.id === id ? { ...it, ...patch } : it)),
    },
  };
  emit();
}

export function deleteBasicItem(type, id) {
  const listKey = `${type}s`;
  state = {
    ...state,
    basicData: { ...state.basicData, [listKey]: state.basicData[listKey].filter((it) => it.id !== id) },
  };
  emit();
}

export function swapStations(i, j, routeName) {
  const stations = state.basicData.stations.filter((s) => s.routeName === routeName);
  if (i < 0 || j < 0 || i >= stations.length || j >= stations.length) return;
  const a = stations[i];
  const b = stations[j];
  updateBasicItem('station', a.id, { sortOrder: b.sortOrder });
  updateBasicItem('station', b.id, { sortOrder: a.sortOrder });
}

// 字符串型资料（车号/检查人/车队）
export function addBasicString(type, value) {
  const listKey = `${type}s`;
  const v = String(value === null || value === undefined ? '' : value)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s\-－—–·．.]+/g, '')
    .trim();
  if (!v) return false;
  const arr = uniqueStrings([...state.basicData[listKey], v]);
  state = { ...state, basicData: { ...state.basicData, [listKey]: arr } };
  emit();
  return true;
}

export function deleteBasicString(type, value) {
  const listKey = `${type}s`;
  state = {
    ...state,
    basicData: { ...state.basicData, [listKey]: state.basicData[listKey].filter((x) => x !== value) },
  };
  emit();
}

export function replaceBasicStrings(type, list) {
  const listKey = `${type}s`;
  state = { ...state, basicData: { ...state.basicData, [listKey]: uniqueStrings(list) } };
  emit();
}

// ---------- 车队 ----------
export function setRouteFleet(routeId, fleetName) {
  state = {
    ...state,
    basicData: {
      ...state.basicData,
      routes: state.basicData.routes.map((r) => (r.id === routeId ? { ...r, fleet: String(fleetName || '').trim() } : r)),
    },
  };
  emit();
}

export function renameFleet(oldName, newName) {
  const v = String(newName || '').trim();
  if (!v || v === oldName) return false;
  if (state.basicData.fleets.includes(v)) return false;
  state = {
    ...state,
    basicData: {
      ...state.basicData,
      fleets: state.basicData.fleets.map((f) => (f === oldName ? v : f)),
      routes: state.basicData.routes.map((r) => (r.fleet === oldName ? { ...r, fleet: v } : r)),
    },
  };
  emit();
  return true;
}

export function deleteFleet(name) {
  state = {
    ...state,
    basicData: {
      ...state.basicData,
      fleets: state.basicData.fleets.filter((f) => f !== name),
      routes: state.basicData.routes.map((r) => (r.fleet === name ? { ...r, fleet: '' } : r)),
    },
  };
  emit();
}

// 资料库合并（Excel 导入等场景）：只填充缺失项，返回新增数量。
// 站点支持字符串（通用站点）与 {name, routeName, sortOrder} 对象（带线路归属）；
// 司机/售票员按姓名补缺，并只为 routeName 为空的已有人员补充线路，不覆盖手工维护的归属。
export function mergeCatalogItems({ stations = [], routes = [], checkers = [], drivers = [], conductors = [] }) {
  const b = state.basicData;
  const stationKeys = new Set(b.stations.map((s) => s.name + '|' + s.routeName));
  let addedStations = 0;
  (stations || []).forEach((s) => {
    const name = typeof s === 'string' ? s.trim() : String((s && s.name) || '').trim();
    if (!name) return;
    const routeName = s && typeof s === 'object' ? String(s.routeName || '').trim() : '';
    const sortOrder = s && typeof s === 'object' && Number.isFinite(s.sortOrder) ? s.sortOrder : 0;
    const key = name + '|' + routeName;
    if (!stationKeys.has(key)) {
      stationKeys.add(key);
      b.stations.push({ id: uid(), name, routeName, sortOrder });
      addedStations++;
    }
  });
  const routeSet = new Set(b.routes.map((r) => r.name));
  let addedRoutes = 0;
  uniqueStrings(routes).forEach((name) => {
    if (!routeSet.has(name)) {
      routeSet.add(name);
      b.routes.push({ id: uid(), name, fleet: '' });
      addedRoutes++;
    }
  });
  const inspectorSet = new Set(b.inspectors);
  let addedCheckers = 0;
  uniqueStrings(checkers).forEach((name) => {
    if (!inspectorSet.has(name)) {
      inspectorSet.add(name);
      b.inspectors.push(name);
      addedCheckers++;
    }
  });
  const driverMap = new Map(b.drivers.map((d) => [d.name, d]));
  let addedDrivers = 0;
  let filledDrivers = 0;
  (drivers || []).forEach((s) => {
    const name = String((s && s.name !== undefined ? s.name : s) || '').trim();
    if (!name) return;
    const routeName = String((s && s.routeName) || '').trim();
    const existing = driverMap.get(name);
    if (!existing) {
      driverMap.set(name, { id: uid(), name, routeName });
      b.drivers.push({ id: uid(), name, routeName });
      addedDrivers++;
    } else if (!existing.routeName && routeName) {
      existing.routeName = routeName;
      filledDrivers++;
    }
  });
  const conductorMap = new Map(b.conductors.map((c) => [c.name, c]));
  let addedConductors = 0;
  let filledConductors = 0;
  (conductors || []).forEach((s) => {
    const name = String((s && s.name !== undefined ? s.name : s) || '').trim();
    if (!name) return;
    const routeName = String((s && s.routeName) || '').trim();
    const existing = conductorMap.get(name);
    if (!existing) {
      conductorMap.set(name, { id: uid(), name, routeName });
      b.conductors.push({ id: uid(), name, routeName });
      addedConductors++;
    } else if (!existing.routeName && routeName) {
      existing.routeName = routeName;
      filledConductors++;
    }
  });
  state = { ...state, basicData: { ...b } };
  emit();
  return { addedStations, addedRoutes, addedCheckers, addedDrivers, addedConductors, filledDrivers, filledConductors };
}

// ---------- 驻站登记时的联想学习 ----------
export function learnStationValues(rec) {
  const b = state.basicData;
  // 站点已带线路归属时，登记过的新站名只补一条通用记录，避免与已有线路站点重复
  if (rec.station && !b.stations.some((s) => s.name === rec.station)) {
    b.stations.push({ id: uid(), name: rec.station, routeName: '', sortOrder: 0 });
  }
  if (rec.checker) b.inspectors = uniqueStrings([rec.checker, ...b.inspectors]);
  if (rec.route && !b.routes.some((r) => r.name === rec.route)) {
    b.routes.push({ id: uid(), name: rec.route, fleet: '' });
  }
  if (rec.plate) b.plates = uniqueStrings([rec.plate, ...b.plates]);
  state = { ...state, basicData: { ...b } };
  emit();
}

// ---------- 驻站上次登记信息 / 备份提醒 ----------
export function getStationLast() {
  const last = loadJSON(STORAGE_KEYS.stationLast, {});
  return { station: '', checker: '', date: '', ...(last || {}) };
}

export function saveStationLast(last) {
  try {
    localStorage.setItem(STORAGE_KEYS.stationLast, JSON.stringify(last || {}));
  } catch (e) {
    console.error('保存驻站上次信息失败', e);
  }
}

export function getStationReminder() {
  const r = loadJSON(STORAGE_KEYS.stationReminder, {});
  return { lastBackupAt: 0, lastBackupCount: 0, ...(r || {}) };
}

export function saveStationReminder(reminder) {
  try {
    localStorage.setItem(STORAGE_KEYS.stationReminder, JSON.stringify(reminder || {}));
  } catch (e) {
    console.error('保存驻站备份提醒失败', e);
  }
}

// ---------- 跳车草稿 / 检查人历史 ----------
export function getDraft() {
  return loadJSON(DRAFT_KEY, null);
}

export function saveDraft(payload) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error('保存草稿失败', e);
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
}

export function getInspectorHistory() {
  return state.basicData.inspectors.slice(0, INSPECTORS_MAX);
}

export function addInspector(name) {
  const n = String(name || '').trim();
  if (!n) return;
  state = {
    ...state,
    basicData: {
      ...state.basicData,
      inspectors: uniqueStrings([n, ...state.basicData.inspectors]).slice(0, 5000),
    },
  };
  emit();
}

export function useStoragePressure() {
  return useSyncExternalStore(subscribePressure, () => pressureState);
}

export function getStorageUsageBytes() {
  return computeStorageUsageBytes();
}

// ---------- 备份（统一 v2）与旧格式合并导入 ----------
export function buildBackupPayload() {
  return {
    app: '公交检查助手',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    records: state.records,
    stationRecords: state.stationRecords,
    basicData: state.basicData,
  };
}

function mergeById(existing, incoming) {
  const seen = new Set(existing.map((r) => r.id));
  const added = [];
  (incoming || []).forEach((r) => {
    if (r && r.id && !seen.has(r.id)) {
      seen.add(r.id);
      added.push(r);
    }
  });
  return { merged: [...existing, ...added], addedCount: added.length };
}

function fleetOfRouteInSettings(settings, routeName) {
  const fleets = settings.fleets || [];
  for (let i = 0; i < fleets.length; i++) {
    if (fleets[i].routes && fleets[i].routes.includes(routeName)) return fleets[i].name;
  }
  return '';
}

function normalizeLegacySettings(settings) {
  const out = emptyBasicData();
  const fleets = Array.isArray(settings.fleets) ? settings.fleets : [];
  out.fleets = uniqueStrings(fleets.map((f) => (f && f.name) || ''));
  uniqueStrings(settings.routes).forEach((name) => {
    out.routes.push({ id: uid(), name, fleet: fleetOfRouteInSettings(settings, name) });
  });
  uniqueStrings(settings.stations).forEach((name) => {
    out.stations.push({ id: uid(), name, routeName: '', sortOrder: 0 });
  });
  out.inspectors = uniqueStrings(settings.checkers);
  out.plates = uniqueStrings(settings.plates);
  return out;
}

function mergeBasicData(current, incoming) {
  const b = {
    routes: current.routes.slice(),
    stations: current.stations.slice(),
    plates: current.plates.slice(),
    inspectors: current.inspectors.slice(),
    drivers: current.drivers.slice(),
    conductors: current.conductors.slice(),
    fleets: current.fleets.slice(),
  };
  const routeMap = new Map(b.routes.map((r) => [r.name, r]));
  (incoming.routes || []).forEach((r) => {
    const existing = routeMap.get(r.name);
    if (!existing) {
      const nr = { id: r.id || uid(), name: r.name, fleet: r.fleet || '' };
      routeMap.set(r.name, nr);
      b.routes.push(nr);
    } else if (!existing.fleet && r.fleet) {
      existing.fleet = r.fleet;
    }
  });
  const stationKeys = new Set(b.stations.map((s) => s.name + '|' + s.routeName));
  (incoming.stations || []).forEach((s) => {
    const key = s.name + '|' + (s.routeName || '');
    if (!stationKeys.has(key)) {
      stationKeys.add(key);
      b.stations.push({ id: s.id || uid(), name: s.name, routeName: s.routeName || '', sortOrder: s.sortOrder || 0 });
    }
  });
  b.plates = uniqueStrings([...b.plates, ...(incoming.plates || [])]);
  b.inspectors = uniqueStrings([...b.inspectors, ...(incoming.inspectors || [])]);
  b.fleets = uniqueStrings([...b.fleets, ...(incoming.fleets || [])]);
  const driverNames = new Set(b.drivers.map((d) => d.name));
  (incoming.drivers || []).forEach((d) => {
    if (!driverNames.has(d.name)) {
      driverNames.add(d.name);
      b.drivers.push({ id: d.id || uid(), name: d.name, routeName: d.routeName || '' });
    }
  });
  const conductorNames = new Set(b.conductors.map((c) => c.name));
  (incoming.conductors || []).forEach((c) => {
    if (!conductorNames.has(c.name)) {
      conductorNames.add(c.name);
      b.conductors.push({ id: c.id || uid(), name: c.name, routeName: c.routeName || '' });
    }
  });
  return b;
}

/**
 * 导入备份（并集合并）。兼容三种格式：
 * - v2 统一备份 {records, stationRecords, basicData}
 * - v1 跳车备份 {records, basicData}
 * - v1 驻站备份 {records, settings}
 */
export function importBackupMerge(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  const isStationV1 = Array.isArray(payload.records) && payload.settings && !payload.basicData;
  const isV2 = Array.isArray(payload.records) && Array.isArray(payload.stationRecords) && payload.basicData;
  const isJumpV1 = Array.isArray(payload.records) && payload.basicData && !payload.stationRecords;
  if (!isStationV1 && !isV2 && !isJumpV1) {
    throw new Error('无法识别的备份格式');
  }

  const jump = mergeById(state.records, isV2 || isJumpV1 ? payload.records : []);
  const station = mergeById(state.stationRecords, isV2 ? payload.stationRecords : isStationV1 ? payload.records : []);
  const incomingBasic = isStationV1
    ? normalizeLegacySettings(payload.settings)
    : normalizeBasicData(payload.basicData);

  state = {
    records: jump.merged,
    stationRecords: station.merged,
    basicData: mergeBasicData(state.basicData, incomingBasic),
  };
  emit();
  return {
    recordsAdded: jump.addedCount,
    stationRecordsAdded: station.addedCount,
    totalStationRecords: state.stationRecords.length,
    totalRecords: state.records.length,
  };
}

/**
 * 预览备份内容（不修改数据）。返回 { kind, recordsCount, stationRecordsCount }。
 * kind: 'v2' | 'jump-v1' | 'station-v1'
 */
export function describeBackup(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('备份文件格式不正确');
  const isStationV1 = Array.isArray(payload.records) && payload.settings && !payload.basicData;
  const isV2 = Array.isArray(payload.records) && Array.isArray(payload.stationRecords) && payload.basicData;
  const isJumpV1 = Array.isArray(payload.records) && payload.basicData && !payload.stationRecords;
  if (!isStationV1 && !isV2 && !isJumpV1) throw new Error('无法识别的备份格式');
  if (isStationV1) {
    return { kind: 'station-v1', recordsCount: payload.records.length, stationRecordsCount: payload.records.length };
  }
  if (isV2) {
    return { kind: 'v2', recordsCount: payload.records.length, stationRecordsCount: payload.stationRecords.length };
  }
  return { kind: 'jump-v1', recordsCount: payload.records.length, stationRecordsCount: 0 };
}

export function replaceAllData({ records, stationRecords, basicData }) {
  state = {
    records: Array.isArray(records) ? records : [],
    stationRecords: Array.isArray(stationRecords) ? stationRecords : [],
    basicData: normalizeBasicData(basicData),
  };
  emit();
}

export function clearAllData() {
  state = { records: [], stationRecords: [], basicData: emptyBasicData() };
  emit();
}
