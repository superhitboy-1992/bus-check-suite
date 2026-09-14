/* 实时公交代理（Cloudflare Worker）

   备用数据源：转发随申行接口并做归一化（应用默认直连上游，不需要这个代理）。
   只暴露三个白名单端点，其它路径一律 404，避免变成开放代理。

   环境变量（wrangler.toml 的 [vars]）：
     UPSTREAM_BASE    上游地址，默认 https://api.shmaas.net
     CITY_CODE        城市代码，默认 310100（上海）
     ALLOWED_ORIGINS  允许的前端来源，逗号分隔，支持 * 通配

   注意：应用默认先试「直连随申行」，但上游只放行 localhost / 127.0.0.1 作为跨域来源，
   局域网 IP 与线上域名直连会被拒；所以这个代理作为备用数据源保留，
   线上部署（GitHub Pages）打开时只有它可用。

   上游地址、路径与响应归一化来自 ../src/lib/live/upstream.js，前端直连模式共用同一份。
*/

import {
  UPSTREAM_BASE,
  UPSTREAM_CITY_CODE,
  UPSTREAM_PATHS,
  hashString,
  normalizeEta,
  upstreamError,
  unwrapUpstream,
} from '../src/lib/live/upstream.js';

// 供测试与外部复用；实现集中在共享模块里
export { hashString, normalizeEta, unwrapUpstream } from '../src/lib/live/upstream.js';

const DEFAULT_UPSTREAM = UPSTREAM_BASE;
const DEFAULT_CITY = UPSTREAM_CITY_CODE;
const DEFAULT_ALLOWED = 'https://*.github.io,http://localhost:*,http://127.0.0.1:*,http://192.168.*:*,http://10.*:*';

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
    const bizError = upstreamError(data);
    if (bizError) return { ok: false, code: bizError.code, message: bizError.message };
    return { ok: true, data };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { ok: false, code: aborted ? 'upstream_timeout' : 'upstream_error', message: aborted ? '上游响应超时' : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
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
