/* 本地预览服务的「同源转发」中间件（Vite 插件）

   为什么需要：随申行接口只放行 localhost / 127.0.0.1 作为跨域来源，
   用局域网 IP（手机连电脑预览）或线上域名打开应用时，浏览器直连会被 403。
   这里由本机服务端代为请求（服务端没有 Origin，不受该限制），
   返回的 JSON 与 worker/ 代理完全一致，前端两个数据源共用一套解析。

   只在 /api/health 与 /api/bus/* 这几个固定路径上生效，不是开放代理。
   同时挂在 dev 与 preview 两种服务器上（pnpm dev / start-preview.cmd）。 */

import {
  UPSTREAM_BASE,
  UPSTREAM_CITY_CODE,
  UPSTREAM_PATHS,
  normalizeEta,
  unwrapUpstream,
  upstreamError,
} from '../src/lib/live/upstream.js';

const HANDLED_PATHS = new Set(['/api/health', '/api/bus/health', '/api/bus/line-search', '/api/bus/line-detail', '/api/bus/eta']);
const TIMEOUT_MS = 8000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function fail(code, message, status = 502) {
  return json({ error: code, error_msg: message }, status);
}

function upstreamBase() {
  return String(process.env.LIVE_UPSTREAM_BASE || UPSTREAM_BASE).replace(/\/+$/, '');
}

function requiredString(body, key) {
  const value = body ? body[key] : undefined;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim();
}

async function upstreamPost(path, payload, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(upstreamBase() + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Saic-CityCode': process.env.LIVE_CITY_CODE || UPSTREAM_CITY_CODE,
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
    return {
      ok: false,
      code: aborted ? 'upstream_timeout' : 'upstream_error',
      message: aborted ? '上游响应超时' : String((e && e.message) || e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 与 worker 代理同样的端点契约。不处理的路径返回 null，交给下一个中间件。
 * @param {Request} request
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<Response|null>}
 */
export async function handleLiveRequest(request, { fetchImpl = globalThis.fetch } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!HANDLED_PATHS.has(path)) return null;

  if (path === '/api/health' || path === '/api/bus/health') {
    return json({ ok: true, upstream: upstreamBase(), city: process.env.LIVE_CITY_CODE || UPSTREAM_CITY_CODE });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object') return fail('bad_request', '请求体必须是 JSON', 400);

  if (path === '/api/bus/line-search') {
    const keywords = requiredString(body, 'keywords');
    if (!keywords) return fail('bad_request', '缺少 keywords', 400);
    const result = await upstreamPost(
      UPSTREAM_PATHS.search,
      {
        keywords,
        type: Number.isFinite(Number(body.type)) ? Number(body.type) : 0,
        pageNo: Number(body.pageNo) || 1,
        pageSize: Number(body.pageSize) || 20,
      },
      fetchImpl
    );
    if (!result.ok) return fail(result.code, result.message);
    return json(unwrapUpstream(result.data));
  }

  if (path === '/api/bus/line-detail') {
    const lineId = requiredString(body, 'lineId');
    const lineName = requiredString(body, 'lineName');
    if (!lineId || !lineName) return fail('bad_request', '缺少 lineId 或 lineName', 400);
    const result = await upstreamPost(
      UPSTREAM_PATHS.detail,
      {
        lineId,
        lineName,
        direction: body.direction === undefined || body.direction === null ? '0' : String(body.direction),
      },
      fetchImpl
    );
    if (!result.ok) return fail(result.code, result.message);
    return json(unwrapUpstream(result.data));
  }

  const lineName = requiredString(body, 'lineName');
  const stopName = requiredString(body, 'stopName');
  const stopId = requiredString(body, 'stopId');
  if (!lineName || !stopName || !stopId) return fail('bad_request', '缺少 lineName、stopName 或 stopId', 400);
  const result = await upstreamPost(
    UPSTREAM_PATHS.eta,
    {
      lineName,
      stopName,
      stopId,
      direction: body.direction === undefined || body.direction === null ? '0' : String(body.direction),
    },
    fetchImpl
  );
  if (!result.ok) return fail(result.code, result.message);
  return json(normalizeEta(result.data, result.data && result.data.now));
}

/** Node / connect 适配：把 IncomingMessage 转成 Request 再交回 Response */
function connectMiddleware(options = {}) {
  return async function liveProxyMiddleware(req, res, next) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!HANDLED_PATHS.has(path)) return next();
    try {
      const chunks = [];
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        for await (const chunk of req) chunks.push(chunk);
      }
      const init = { method: req.method };
      if (chunks.length) init.body = Buffer.concat(chunks);
      const response = await handleLiveRequest(new Request(url, init), options);
      if (!response) return next();
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'internal_error', error_msg: String((e && e.message) || e) }));
    }
    return undefined;
  };
}

export default function liveDevProxy(options = {}) {
  return {
    name: 'bus-live-dev-proxy',
    configureServer(server) {
      server.middlewares.use(connectMiddleware(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(connectMiddleware(options));
    },
  };
}
