/* 实时公交代理（Cloudflare Worker）

   浏览器不能直连随申行接口（跨域预检 403），由这个 Worker 转发并做归一化。
   只暴露三个白名单端点，其它路径一律 404，避免变成开放代理。

   环境变量（wrangler.toml 的 [vars]）：
     UPSTREAM_BASE    上游地址，默认 https://api.shmaas.net
     CITY_CODE        城市代码，默认 310100（上海）
     ALLOWED_ORIGINS  允许的前端来源，逗号分隔，支持 * 通配
*/

const DEFAULT_UPSTREAM = 'https://api.shmaas.net';
const DEFAULT_CITY = '310100';
const DEFAULT_ALLOWED = 'https://*.github.io,http://localhost:*,http://127.0.0.1:*,http://192.168.*:*,http://10.*:*';

const UPSTREAM_PATHS = {
  search: '/traffic/v2/querytrafficline',
  detail: '/traffic/v1/querybusline',
  eta: '/traffic/v1/getbusstoparrivedetails',
};

/** 上游统一是 { errCode, errMsg, data } 包装，这里取出内层业务数据 */
export function unwrapUpstream(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload && typeof payload === 'object' ? payload : {};
}

const CACHE_TTL_SECONDS = {
  detail: 60 * 60 * 24,
  eta: 20,
};

const TIMEOUT_MS = 8000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function fail(code, message, status = 502) {
  return json({ error: code, error_msg: message }, status);
}

function originAllowed(origin, patterns) {
  if (!origin) return true; // 命令行/服务端调用没有 Origin，直接放行
  if (!patterns.length) return false;
  return patterns.some((pattern) => {
    const escaped = pattern
      .trim()
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(origin);
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Saic-CityCode',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return null;
  }
}

function requiredString(body, key) {
  const value = body ? body[key] : undefined;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim();
}

async function upstreamPost(env, path, payload) {
  const base = (env.UPSTREAM_BASE || DEFAULT_UPSTREAM).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Saic-CityCode': env.CITY_CODE || DEFAULT_CITY,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) return { ok: false, code: 'upstream_error', message: `HTTP ${res.status}` };
    if (!data || (data.errCode !== undefined && data.errCode !== 0)) {
      return { ok: false, code: 'upstream_error', message: (data && data.errMsg) || '上游返回异常' };
    }
    return { ok: true, data };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { ok: false, code: aborted ? 'upstream_timeout' : 'upstream_error', message: aborted ? '上游响应超时' : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 上游到站原始数据 → 前端统一契约 */
export function normalizeEta(payload, upstreamNow) {
  const data = unwrapUpstream(payload);
  const nowMs = Number.isFinite(Number(upstreamNow)) ? Number(upstreamNow) : Number(payload && payload.now);
  const info = (data && data.stopArriveInfo) || {};
  const schedule = (data && data.dispatchCarSchedule) || {};
  const buses = [];

  const pushBus = (prefix) => {
    // 上游字段名是 currentLicensePlate / nextLicensePlate，
    // 兼容个别版本里出现的 currentLicensePlat 写法
    const rawPlate = info[`${prefix}LicensePlate`] !== undefined ? info[`${prefix}LicensePlate`] : info[`${prefix}LicensePlat`];
    const plate = rawPlate !== undefined && rawPlate !== null ? String(rawPlate).trim() : '';
    const stopsAway = toNumber(info[`${prefix}BusStopCount`]);
    const distanceMeters = toNumber(info[`${prefix}BusDistance`]);
    const etaMinutes = toNumber(info[`${prefix}BusArriveTime`]);
    const running = Boolean(plate) || (stopsAway !== null && stopsAway > 0) || etaMinutes !== null;
    if (!running) return;
    buses.push({
      plate,
      stopsAway: stopsAway === null ? null : Math.max(0, stopsAway),
      distanceMeters,
      etaMinutes,
      accessible: Boolean(prefix === 'current' ? info.currentBarrierFree : info.nextBarrierFree) || /无障碍/.test(plate),
      gps: prefix === 'current' && info.currentBusGps ? String(info.currentBusGps) : '',
    });
  };

  pushBus('current');
  pushBus('next');

  const cars = (Array.isArray(schedule.dispatchCars) ? schedule.dispatchCars : [])
    .map((car) => ({
      vehicle: car && car.vehicle ? String(car.vehicle) : '',
      time: car && car.time ? String(car.time) : '',
      countdown: car && car.countdown !== undefined && car.countdown !== null ? String(car.countdown) : '',
    }))
    .filter((car) => car.vehicle || car.time);

  const message = String(schedule.scheduleMsgShort || schedule.scheduleMsg || '').trim();
  const status = buses.length ? 'running' : cars.length || !message ? 'waiting' : 'closed';

  return {
    status,
    buses,
    schedule: { message, cars },
    updatedAt: new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString(),
  };
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health' || path === '/api/bus/health') {
    return json({ ok: true, upstream: env.UPSTREAM_BASE || DEFAULT_UPSTREAM, city: env.CITY_CODE || DEFAULT_CITY });
  }
  if (path === '/api/bus/line-search') {
    const body = await readJsonBody(request);
    if (!body) return fail('bad_request', '请求体必须是 JSON', 400);
    const keywords = requiredString(body, 'keywords');
    if (!keywords) return fail('bad_request', '缺少 keywords', 400);
    const result = await upstreamPost(env, UPSTREAM_PATHS.search, {
      keywords,
      type: Number.isFinite(Number(body.type)) ? Number(body.type) : 0,
      pageNo: Number(body.pageNo) || 1,
      pageSize: Number(body.pageSize) || 20,
    });
    if (!result.ok) return fail(result.code, result.message);
    return json(unwrapUpstream(result.data));
  }
  if (path === '/api/bus/line-detail') {
    const body = await readJsonBody(request);
    if (!body) return fail('bad_request', '请求体必须是 JSON', 400);
    const lineId = requiredString(body, 'lineId');
    const lineName = requiredString(body, 'lineName');
    if (!lineId || !lineName) return fail('bad_request', '缺少 lineId 或 lineName', 400);
    const result = await upstreamPost(env, UPSTREAM_PATHS.detail, {
      lineId,
      lineName,
      direction: body.direction === undefined || body.direction === null ? '0' : String(body.direction),
    });
    if (!result.ok) return fail(result.code, result.message);
    return json(unwrapUpstream(result.data));
  }
  if (path === '/api/bus/eta') {
    const body = await readJsonBody(request);
    if (!body) return fail('bad_request', '请求体必须是 JSON', 400);
    const lineName = requiredString(body, 'lineName');
    const stopName = requiredString(body, 'stopName');
    const stopId = requiredString(body, 'stopId');
    if (!lineName || !stopName || !stopId) return fail('bad_request', '缺少 lineName、stopName 或 stopId', 400);
    const direction = body.direction === undefined || body.direction === null ? '0' : String(body.direction);
    const result = await upstreamPost(env, UPSTREAM_PATHS.eta, { lineName, stopName, stopId, direction });
    if (!result.ok) return fail(result.code, result.message);
    return json(normalizeEta(result.data, result.data && result.data.now));
  }
  return fail('not_found', '接口不存在', 404);
}

/** 请求体指纹（FNV-1a 32 位），用于区分不同站点的缓存条目 */
export function hashString(value) {
  let h = 0x811c9dc5;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function withCache(cacheKeyUrl, ctx, ttlSeconds, producer) {
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const response = await producer();
  if (response.ok && ttlSeconds > 0) {
    const cached = new Response(response.clone().body, response);
    cached.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  }
  return response;
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(origin, allowed)) return fail('origin_not_allowed', '来源不在白名单', 403);
      return new Response(null, { status: 204, headers });
    }
    if (!originAllowed(origin, allowed)) {
      return fail('origin_not_allowed', '来源不在白名单', 403);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    let cacheKeyUrl = url.toString();
    if (request.method === 'POST') {
      const bodyText = await request.clone().text();
      cacheKeyUrl = `${url.origin}${url.pathname}?b=${hashString(bodyText)}`;
    }

    let response;
    try {
      if (request.method !== 'GET' && request.method !== 'POST') {
        response = fail('method_not_allowed', '只支持 GET/POST', 405);
      } else if (path === '/api/bus/eta') {
        response = await withCache(cacheKeyUrl, ctx, CACHE_TTL_SECONDS.eta, () => handleRequest(request, env));
      } else if (path === '/api/bus/line-detail') {
        response = await withCache(cacheKeyUrl, ctx, CACHE_TTL_SECONDS.detail, () => handleRequest(request, env));
      } else {
        response = await handleRequest(request, env);
      }
    } catch (e) {
      response = fail('internal_error', String((e && e.message) || e), 500);
    }

    const out = new Response(response.body, response);
    Object.entries(headers).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
