/* Netlify Function：/api/* 的实时到站转发

   复用 worker/index.js 的全部端点与归一化逻辑（同一份上游契约），
   只在外面套一层 Node/Netlify 适配：
     - 把 /api/... 与 /.netlify/functions/live-proxy/... 都还原成 /api/...
     - 补上 Cloudflare 才有的 caches / ctx，让 worker 代码原样可跑
     - 环境变量沿用 UPSTREAM_BASE / CITY_CODE / ALLOWED_ORIGINS（Netlify 后台可配）

   应用与函数同域，浏览器同源请求，不需要 CORS，也不受上游「只放行 localhost」的限制。 */

import worker from '../../worker/index.js';

if (!globalThis.caches || !globalThis.caches.default) {
  globalThis.caches = {
    default: {
      async match() {
        return undefined;
      },
      async put() {
        return undefined;
      },
      async delete() {
        return undefined;
      },
    },
  };
}

/** 把函数路径还原成 worker 约定的 /api/... */
export function canonicalPath(pathname) {
  const marker = pathname.indexOf('/api/');
  if (marker >= 0) return pathname.slice(marker);
  const rest = pathname.replace(/^\/\.netlify\/functions\/live-proxy/, '');
  return `/api${rest.startsWith('/') ? rest : `/${rest}`}`;
}

function workerEnv() {
  const env = {};
  if (process.env.UPSTREAM_BASE) env.UPSTREAM_BASE = process.env.UPSTREAM_BASE;
  if (process.env.CITY_CODE) env.CITY_CODE = process.env.CITY_CODE;
  if (process.env.ALLOWED_ORIGINS) env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
  return env;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const target = new URL(canonicalPath(url.pathname) + url.search, url.origin);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const forwarded = new Request(target, {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    ...(hasBody ? { body: await request.text() } : {}),
  });
  return worker.fetch(forwarded, workerEnv(), { waitUntil: () => undefined });
}
