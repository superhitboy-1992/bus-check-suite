/* 实时到站：把代理返回的数据归一化成界面用的行数据，
   并提供 TTL 缓存与并发上限（一个站点最多十几条线路 × 2 个方向）。 */
import {
  LiveError,
  SOURCE_KIND,
  isFailoverError,
  markSourceFail,
  markSourceOk,
  pickSources,
  requestEta,
} from './client';

export const LIVE_STATUS = {
  RUNNING: 'running',
  WAITING: 'waiting',
  CLOSED: 'closed',
  ERROR: 'error',
};

export function directionLabel(upDown) {
  return Number(upDown) === 0 ? '上行' : '下行';
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const plate = String(raw.plate || '').trim();
  const stopsAway = toNumber(raw.stopsAway);
  const etaMinutes = toNumber(raw.etaMinutes);
  const distanceMeters = toNumber(raw.distanceMeters);
  if (!plate && stopsAway === null && etaMinutes === null && distanceMeters === null) return null;
  return {
    plate,
    stopsAway,
    etaMinutes,
    distanceMeters,
    accessible: raw.accessible === true || /无障碍/.test(plate),
    gps: String(raw.gps || ''),
  };
}

/** 防御性解析：代理已经归一化过一次，这里保证界面拿到的形状始终一致 */
export function parseEta(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const buses = (Array.isArray(src.buses) ? src.buses : []).map(normalizeBus).filter(Boolean);
  const scheduleSrc = (src.schedule && typeof src.schedule === 'object' ? src.schedule : {}) || {};
  const cars = (Array.isArray(scheduleSrc.cars) ? scheduleSrc.cars : [])
    .map((car) => ({
      vehicle: String((car && car.vehicle) || '').trim(),
      time: String((car && car.time) || '').trim(),
      countdown: car && car.countdown !== undefined && car.countdown !== null ? String(car.countdown).trim() : '',
    }))
    .filter((car) => car.vehicle || car.time || car.countdown);
  const message = String(scheduleSrc.message || '').trim();

  let status = String(src.status || '');
  if (!Object.values(LIVE_STATUS).includes(status) || status === LIVE_STATUS.ERROR) {
    status = buses.length ? LIVE_STATUS.RUNNING : cars.length || !message ? LIVE_STATUS.WAITING : LIVE_STATUS.CLOSED;
  }
  return {
    status,
    buses,
    schedule: { message, cars },
    updatedAt: toNumber(src.updatedAt) || Date.parse(src.updatedAt) || Date.now(),
  };
}

/** 一趟查询（线路 + 方向 + 站）→ 一行界面数据 */
export function toRow(parsed, task) {
  const first = parsed.buses[0] || null;
  const next = parsed.buses[1] || null;
  return {
    key: `${task.routeName}|${task.upDown}`,
    routeName: task.routeName,
    upDown: Number(task.upDown),
    directionLabel: directionLabel(task.upDown),
    toward: task.toward || '',
    stopName: task.stopName || '',
    stopId: String(task.stopId || ''),
    status: parsed.status,
    buses: parsed.buses,
    first,
    next,
    schedule: parsed.schedule,
    error: null,
    stale: false,
    staleAt: 0,
    updatedAt: parsed.updatedAt,
  };
}

export function errorRow(task, error) {
  return {
    key: `${task.routeName}|${task.upDown}`,
    routeName: task.routeName,
    upDown: Number(task.upDown),
    directionLabel: directionLabel(task.upDown),
    toward: task.toward || '',
    stopName: task.stopName || '',
    stopId: String(task.stopId || ''),
    status: LIVE_STATUS.ERROR,
    buses: [],
    first: null,
    next: null,
    schedule: { message: '', cars: [] },
    error: error instanceof LiveError ? error : new LiveError('unknown_error', '实时数据获取失败'),
    stale: false,
    staleAt: 0,
    updatedAt: Date.now(),
  };
}

const STATUS_ORDER = {
  [LIVE_STATUS.RUNNING]: 0,
  [LIVE_STATUS.WAITING]: 1,
  [LIVE_STATUS.CLOSED]: 2,
  [LIVE_STATUS.ERROR]: 3,
};

function nextBusSortValue(row) {
  const car = (row.schedule.cars || [])[0];
  if (!car) return Number.MAX_SAFE_INTEGER;
  const countdown = Number(car.countdown);
  if (Number.isFinite(countdown)) return countdown;
  return Number.MAX_SAFE_INTEGER - 1;
}

/** 在途车优先（按预计到达升序），其次等待发车、不在运营时间、出错 */
export function sortRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.status === LIVE_STATUS.RUNNING) {
      const ea = a.first && a.first.etaMinutes !== null ? a.first.etaMinutes : Number.MAX_SAFE_INTEGER;
      const eb = b.first && b.first.etaMinutes !== null ? b.first.etaMinutes : Number.MAX_SAFE_INTEGER;
      if (ea !== eb) return ea - eb;
    }
    if (a.status === LIVE_STATUS.WAITING) {
      const va = nextBusSortValue(a);
      const vb = nextBusSortValue(b);
      if (va !== vb) return va - vb;
    }
    const byRoute = String(a.routeName).localeCompare(String(b.routeName), 'zh-Hans-CN');
    if (byRoute !== 0) return byRoute;
    return a.upDown - b.upDown;
  });
}

/** TTL 缓存（默认 20 秒），键由调用方拼好。
    过期的条目不会立刻删除，保留一段时间供请求失败时兜底展示。 */
export function createTtlCache({ ttlMs = 20000, maxAgeMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  const map = new Map();
  function prune() {
    const t = now();
    map.forEach((hit, key) => {
      if (t - hit.at > maxAgeMs) map.delete(key);
    });
  }
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      return now() - hit.at > ttlMs ? null : hit.value;
    },
    /** 忽略 TTL 取上一次的值，用于请求失败时兜底展示（标记为旧数据） */
    getStale(key) {
      const hit = map.get(key);
      return hit ? { value: hit.value, at: hit.at } : null;
    },
    set(key, value) {
      prune();
      map.set(key, { at: now(), value });
      return value;
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

/** 并发受限的 map，保持结果顺序与入参一致 */
export async function mapWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(limit) || 1);
  const results = new Array(list.length);
  let cursor = 0;
  async function run() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, list.length || 1) }, run));
  return results;
}

export const DEFAULT_ETA_CACHE_TTL_MS = 20000;
export const DEFAULT_CONCURRENCY = 4;

/**
 * 批量取一个站点上多条线路的到站数据。
 * @param {object} options
 * @param {Array<{kind: string, baseUrl: string}>} [options.sources] 候选数据源（按优先顺序，失败自动换下一个）
 * @param {string} [options.proxyBaseUrl] 兼容旧调用：只用一个代理数据源
 * @param {Array<{routeName: string, upDown: number, toward?: string, stopName: string, stopId: string}>} options.tasks
 * @param {object} [options.cache] createTtlCache 的实例
 * @param {number} [options.concurrency]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function loadArrivalRows({
  sources,
  proxyBaseUrl,
  tasks,
  cache,
  concurrency = DEFAULT_CONCURRENCY,
  signal,
  fetchImpl,
} = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const store = cache || createTtlCache({ ttlMs: DEFAULT_ETA_CACHE_TTL_MS });
  const candidates = resolveCandidates(sources, proxyBaseUrl);
  const rows = await mapWithConcurrency(list, concurrency, async (task) => {
    const key = `${task.routeName}|${task.upDown}|${task.stopId}`;
    const hit = store.get(key);
    if (hit) return toRow(hit, task);

    const params = {
      lineName: task.routeName,
      stopName: task.stopName,
      stopId: String(task.stopId),
      direction: String(task.upDown),
    };
    let lastError = null;
    for (const source of pickSources(candidates)) {
      try {
        const payload = await requestEta(source, params, { signal, fetchImpl });
        markSourceOk(source);
        const parsed = parseEta(payload);
        store.set(key, parsed);
        return toRow(parsed, task);
      } catch (e) {
        if (e instanceof LiveError && e.code === 'aborted') throw e;
        lastError = e;
        if (isFailoverError(e)) markSourceFail(source);
        else break;
      }
    }

    const error = lastError || new LiveError('not_configured', '未配置实时数据源');
    // 失败时退回上一次拿到的数据（即使已过期），界面会标注为旧数据
    const stale = store.getStale(key);
    if (stale) {
      return { ...toRow(stale.value, task), stale: true, staleAt: stale.at, error };
    }
    return errorRow(task, error);
  });
  return sortRows(rows);
}

/** 候选数据源：优先用显式传入的 sources，兼容只传 proxyBaseUrl 的旧调用 */
function resolveCandidates(sources, proxyBaseUrl) {
  const list = (Array.isArray(sources) ? sources : []).filter(Boolean);
  if (list.length) return list;
  const base = String(proxyBaseUrl || '').trim().replace(/\/+$/, '');
  return base ? [{ kind: SOURCE_KIND.PROXY, baseUrl: base }] : [];
}
