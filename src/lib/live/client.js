/* 实时数据客户端：只与自建代理（Cloudflare Worker）通信，
   统一超时、重试与错误归一化，失败时不抛到页面级、由调用方降级展示。 */

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
  timeout: '请求超时，请稍后重试',
  upstream_timeout: '数据源响应超时',
  upstream_error: '数据源暂时不可用',
  bad_request: '请求参数有误',
  origin_not_allowed: '代理未放行当前站点来源，请检查 Worker 的 ALLOWED_ORIGINS',
  not_found: '代理地址不正确（接口不存在）',
  internal_error: '代理内部错误',
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统一的 JSON 请求（带超时与有限重试）。
 * @param {object} options
 * @param {string} options.url
 * @param {'GET'|'POST'} [options.method]
 * @param {object} [options.body]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries]
 * @param {AbortSignal} [options.signal] 外部取消信号（面板收起时中止）
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function requestJson({
  url,
  method = 'POST',
  body,
  timeoutMs = 10000,
  retries = 1,
  signal,
  fetchImpl,
} = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new LiveError('network_error', LIVE_ERROR_TEXT.network_error);

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
        headers: { 'Content-Type': 'application/json' },
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
      return payload;
    } catch (e) {
      if (e instanceof LiveError && e.code === 'aborted') throw e;
      if (signal && signal.aborted) throw new LiveError('aborted', '已取消');
      if (e instanceof LiveError) lastError = e;
      else if (e && e.name === 'AbortError') lastError = new LiveError('timeout', LIVE_ERROR_TEXT.timeout);
      else lastError = new LiveError('network_error', LIVE_ERROR_TEXT.network_error);
      if (attempt < retries) await delay(500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new LiveError('unknown_error', '实时数据获取失败');
}

/** 查询某线路某方向某站的实时到站 */
export function fetchEta(proxyBaseUrl, params, options = {}) {
  return requestJson({
    url: joinUrl(proxyBaseUrl, '/api/bus/eta'),
    method: 'POST',
    body: params,
    ...options,
  });
}

/** 连通性自检 */
export function checkHealth(proxyBaseUrl, options = {}) {
  return requestJson({
    url: joinUrl(proxyBaseUrl, '/api/health'),
    method: 'GET',
    retries: 0,
    ...options,
  });
}
