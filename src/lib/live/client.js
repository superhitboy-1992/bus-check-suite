/* 实时数据客户端：两种数据源 + 统一超时、重试与错误归一化。

   数据源：
     direct  直连随申行上游（只放行 localhost / 127.0.0.1 来源，本机预览时可用）
     local   同源转发：由本机预览服务（tools/live-dev-proxy.js）代为请求，
             手机用局域网 IP 打开预览时走这条（服务端没有 Origin，不受上游限制）
     proxy   自建 Cloudflare Worker 代理（备用；线上部署或直连、同源都不通时用）

   失败时不抛到页面级，由调用方降级展示。 */

import {
  UPSTREAM_BASE,
  UPSTREAM_CITY_CODE,
  UPSTREAM_PATHS,
  normalizeEta,
  upstreamError,
} from './upstream';

export class LiveError extends Error {
  constructor(code, message, status = 0) {
    super(message || code);
    this.name = 'LiveError';
    this.code = code || 'unknown_error';
    this.status = status;
  }
}

export const LIVE_ERROR_TEXT = {
  network_error: '网络不可用，或代理地址不正确',
  upstream_unreachable:
    '直连随申行失败：网络不通，或当前来源不被上游放行（上游只放行 localhost，局域网 IP 与线上域名会被拒）',
  timeout: '请求超时，请稍后重试',
  upstream_timeout: '数据源响应超时',
  upstream_error: '数据源暂时不可用',
  bad_request: '请求参数有误',
  origin_not_allowed: '代理未放行当前站点来源，请检查 Worker 的 ALLOWED_ORIGINS',
  not_found: '代理地址不正确（接口不存在）',
  internal_error: '代理内部错误',
  not_configured: '未配置实时数据源',
  line_map_unavailable: '站点映射文件不可用（可能离线，或没有生成 public/line-map.json）',
};

export function liveErrorText(error) {
  if (!error) return '';
  const code = error.code || 'unknown_error';
  return LIVE_ERROR_TEXT[code] || error.message || '实时数据获取失败';
}

export function joinUrl(base, path) {
  return String(base || '').replace(/\/+$/, '') + path;
}

/* ------------------------------ 数据源 ------------------------------ */

export const SOURCE_KIND = { DIRECT: 'direct', LOCAL: 'local', PROXY: 'proxy' };

// 直连 8 秒、代理 10 秒（代理/同源转发自身对上游超时 8 秒，客户端要留出余量）
export const DIRECT_TIMEOUT_MS = 8000;
export const PROXY_TIMEOUT_MS = 10000;

export function createDirectSource() {
  return { kind: SOURCE_KIND.DIRECT, baseUrl: UPSTREAM_BASE };
}

export function createLocalSource() {
  return { kind: SOURCE_KIND.LOCAL, baseUrl: '' };
}

export function createProxySource(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  return base ? { kind: SOURCE_KIND.PROXY, baseUrl: base } : null;
}

/**
 * 配置 → 候选数据源（按优先顺序）。
 * source 取值：auto（默认，直连优先、失败自动回退代理）/ direct / proxy
 */
export function buildSources(config) {
  const cfg = config || {};
  const mode = cfg.source === 'direct' || cfg.source === 'proxy' ? cfg.source : 'auto';
  const proxy = createProxySource(cfg.proxyBaseUrl);
  if (mode === 'direct') return [createDirectSource()];
  if (mode === 'proxy') return proxy ? [proxy] : [];
  // 同源转发始终排第二：本机预览服务、Netlify 这类「静态站 + 同源函数」的部署都靠它，
  // 线上没有这个路径时只是多一次秒回的 404，然后自动落到自建代理
  const candidates = [createDirectSource()];
  candidates.push(createLocalSource());
  if (proxy) candidates.push(proxy);
  return candidates;
}

export function sourceKey(source) {
  if (!source) return '';
  return `${source.kind}:${source.baseUrl}`;
}

export function sourceLabel(source) {
  if (!source) return '';
  if (source.kind === SOURCE_KIND.DIRECT) return '直连随申行';
  if (source.kind === SOURCE_KIND.LOCAL) return '同源转发（本机预览服务）';
  return `自建代理 ${source.baseUrl}`;
}

/* 数据源健康状态：某一轮失败后短暂降级，避免每行都白等一个超时 */
const SOURCE_HEALTH = new Map();
export const SOURCE_FAIL_TTL_MS = 60000;

export function markSourceOk(source, now = Date.now()) {
  SOURCE_HEALTH.set(sourceKey(source), { state: 'ok', at: now });
}

export function markSourceFail(source, now = Date.now()) {
  SOURCE_HEALTH.set(sourceKey(source), { state: 'fail', at: now });
}

export function resetSourceHealth() {
  SOURCE_HEALTH.clear();
}

function healthRank(source, now) {
  const hit = SOURCE_HEALTH.get(sourceKey(source));
  if (!hit || now - hit.at > SOURCE_FAIL_TTL_MS) return 1; // 未知
  return hit.state === 'ok' ? 0 : 2;
}

export function orderSources(sources, now = Date.now()) {
  return (Array.isArray(sources) ? sources.slice() : []).sort((a, b) => healthRank(a, now) - healthRank(b, now));
}

/** 只挑「没失败过」的数据源；全部失败过（大概率整体不通）时只试一个，快速失败 */
export function pickSources(sources, now = Date.now()) {
  const ranked = orderSources(sources, now);
  const healthy = ranked.filter((s) => healthRank(s, now) < 2);
  return healthy.length ? healthy : ranked.slice(0, 1);
}

/** 这类错误换一个数据源可能有救；参数错误/已取消则不必重试 */
export function isFailoverError(error) {
  const code = (error && error.code) || '';
  return code !== 'aborted' && code !== 'bad_request' && code !== 'not_configured';
}

/* ------------------------------ 请求 ------------------------------ */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(code) {
  return code === 'network_error' || code === 'upstream_unreachable' || code === 'internal_error';
}

/**
 * 统一的 JSON 请求（带超时与有限重试）。
 * @param {object} options
 * @param {string} options.url
 * @param {'GET'|'POST'} [options.method]
 * @param {object} [options.body]
 * @param {object} [options.headers] 额外请求头
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries]
 * @param {string} [options.networkCode] 连接层失败时使用的错误码
 * @param {(payload: any) => ({code: string, message: string} | null)} [options.validateError]
 * @param {AbortSignal} [options.signal] 外部取消信号（面板收起时中止）
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function requestJson({
  url,
  method = 'POST',
  body,
  headers,
  timeoutMs = PROXY_TIMEOUT_MS,
  retries = 1,
  networkCode = 'network_error',
  validateError,
  signal,
  fetchImpl,
} = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new LiveError(networkCode, LIVE_ERROR_TEXT[networkCode] || LIVE_ERROR_TEXT.network_error);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal && signal.aborted) throw new LiveError('aborted', '已取消');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await doFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        ...(method === 'POST' && body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok || (payload && payload.error)) {
        throw new LiveError(
          (payload && payload.error) || `http_${res.status}`,
          (payload && payload.error_msg) || `请求失败（HTTP ${res.status}）`,
          res.status
        );
      }
      const bizError = validateError ? validateError(payload) : null;
      if (bizError) throw new LiveError(bizError.code, bizError.message);
      return payload;
    } catch (e) {
      if (e instanceof LiveError && e.code === 'aborted') throw e;
      if (signal && signal.aborted) throw new LiveError('aborted', '已取消');
      if (e instanceof LiveError) lastError = e;
      else if (e && e.name === 'AbortError') lastError = new LiveError('timeout', LIVE_ERROR_TEXT.timeout);
      else lastError = new LiveError(networkCode, LIVE_ERROR_TEXT[networkCode] || LIVE_ERROR_TEXT.network_error);
      // 超时重试等于把等待翻倍，没意义；只重试连接层抖动
      if (attempt < retries && isRetryable(lastError.code)) await delay(400 * (attempt + 1));
      else break;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new LiveError('unknown_error', '实时数据获取失败');
}

function etaRequestBody(params) {
  return {
    lineName: params.lineName,
    stopName: params.stopName,
    stopId: String(params.stopId),
    direction: params.direction === undefined || params.direction === null ? '0' : String(params.direction),
  };
}

/** 代理/同源转发的响应必须是我们约定的结构，否则按「接口不存在」处理并换下一条路 */
function isEtaContract(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return 'status' in payload || 'buses' in payload;
}

function etaPayloadError(payload) {
  if (isEtaContract(payload)) return null;
  return { code: 'not_found', message: '接口不存在或返回的不是实时到站数据' };
}

function healthPayloadError(payload) {
  if (payload && typeof payload === 'object' && payload.ok === true) return null;
  return { code: 'not_found', message: '接口不存在（不是实时到站代理）' };
}

/** 查询某数据源某线路某方向某站的实时到站，返回统一契约 */
export async function requestEta(source, params, options = {}) {
  const body = etaRequestBody(params);
  if (!source) throw new LiveError('not_configured', LIVE_ERROR_TEXT.not_configured);
  if (source.kind === SOURCE_KIND.DIRECT) {
    const payload = await requestJson({
      url: joinUrl(source.baseUrl, UPSTREAM_PATHS.eta),
      method: 'POST',
      body,
      headers: { 'X-Saic-CityCode': UPSTREAM_CITY_CODE },
      timeoutMs: DIRECT_TIMEOUT_MS,
      networkCode: 'upstream_unreachable',
      validateError: upstreamError,
      ...options,
    });
    return normalizeEta(payload, payload && payload.now);
  }
  return requestJson({
    url: joinUrl(source.baseUrl, '/api/bus/eta'),
    method: 'POST',
    body,
    timeoutMs: PROXY_TIMEOUT_MS,
    validateError: etaPayloadError,
    ...options,
  });
}

/**
 * 单个数据源的连通性自检。
 * direct：向上游发一次最小搜索请求（验证 DNS / TLS / 跨域 / 上游业务是否正常）
 * proxy：请求代理的 /api/health
 */
export async function checkSource(source, options = {}) {
  if (!source) throw new LiveError('not_configured', LIVE_ERROR_TEXT.not_configured);
  if (source.kind === SOURCE_KIND.DIRECT) {
    const payload = await requestJson({
      url: joinUrl(source.baseUrl, UPSTREAM_PATHS.search),
      method: 'POST',
      body: { keywords: '1', type: 0, pageNo: 1, pageSize: 1 },
      headers: { 'X-Saic-CityCode': UPSTREAM_CITY_CODE },
      timeoutMs: 8000,
      retries: 0,
      networkCode: 'upstream_unreachable',
      validateError: upstreamError,
      ...options,
    });
    const matched = payload && payload.data ? Number(payload.data.rowCount) : null;
    return {
      ok: true,
      detail: `上游 ${source.baseUrl} 正常${Number.isFinite(matched) ? `（返回 ${matched} 条线路）` : ''}`,
    };
  }
  const health = await requestJson({
    url: joinUrl(source.baseUrl, '/api/health'),
    method: 'GET',
    timeoutMs: 8000,
    retries: 0,
    validateError: healthPayloadError,
    ...options,
  });
  return {
    ok: true,
    detail: `${source.kind === SOURCE_KIND.LOCAL ? '同源转发正常' : '代理正常'}（上游 ${
      (health && health.upstream) || '—'
    }，城市 ${(health && health.city) || '—'}）`,
  };
}
