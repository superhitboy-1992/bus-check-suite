/* 实时到站配置：数据源、代理地址、刷新间隔、开关。
   存在浏览器 localStorage，不进备份必需字段，缺失或非法时按未配置处理。 */
import { useSyncExternalStore } from 'react';

export const LIVE_CONFIG_KEY = 'busCheck.liveConfig';

// 数据源选项：auto = 直连优先、失败自动回退到自建代理
export const LIVE_SOURCE_OPTIONS = [
  { value: 'auto', label: '自动（推荐）' },
  { value: 'direct', label: '直连随申行' },
  { value: 'proxy', label: '自建代理' },
];

// 刷新间隔选项（秒），0 表示只手动刷新
export const REFRESH_OPTIONS = [
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '60 秒' },
  { value: 0, label: '手动刷新' },
];

const BUILD_DEFAULT_PROXY =
  (import.meta && import.meta.env && import.meta.env.VITE_LIVE_PROXY_BASE) || '';

// 已部署的 Cloudflare Worker 代理地址（备用数据源；默认「自动」模式下直连优先）。
// 注意：*.workers.dev 在部分国内网络下会被 DNS 投毒/连接无响应，若直连也不通，
// 可在「基础数据 → 实时数据源」里换成自定义域名，或用构建变量 VITE_LIVE_PROXY_BASE 覆盖。
export const DEPLOYED_PROXY_BASE = 'https://bus-live-proxy.1015184868.workers.dev';

// 历史上当过内置默认值的代理地址。它们只是「产品默认」，不是用户手动选择：
// 换默认值后，老设备 localStorage 里存着的旧地址不应该继续生效
// （否则换了可用代理，老设备还会一直去连被封的地址）。
export const LEGACY_PROXY_BASES = [DEPLOYED_PROXY_BASE];

export const DEFAULT_LIVE_CONFIG = {
  enabled: true,
  source: 'auto',
  proxyBaseUrl: String(BUILD_DEFAULT_PROXY || DEPLOYED_PROXY_BASE).trim(),
  refreshSeconds: 30,
};

/**
 * 代理地址迁移：只有用户手动填过的地址（proxyBaseUrlCustom）才一直沿用，
 * 沿用旧内置默认值的设备自动切到新的构建默认值。
 */
export function migrateProxyBaseUrl({ stored, custom, buildDefault }) {
  const fallback = String(buildDefault || '').trim();
  if (stored === undefined) return fallback;
  const value = String(stored || '').trim();
  if (custom !== true && value && value !== fallback && LEGACY_PROXY_BASES.includes(value)) return fallback;
  return value;
}

export function normalizeLiveConfig(raw, buildDefault = DEFAULT_LIVE_CONFIG.proxyBaseUrl) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const refresh = Number(src.refreshSeconds);
  const allowed = REFRESH_OPTIONS.map((o) => o.value);
  const source = LIVE_SOURCE_OPTIONS.some((o) => o.value === src.source) ? src.source : DEFAULT_LIVE_CONFIG.source;
  return {
    enabled: src.enabled === undefined ? DEFAULT_LIVE_CONFIG.enabled : src.enabled !== false,
    source,
    proxyBaseUrl: migrateProxyBaseUrl({
      stored: src.proxyBaseUrl,
      custom: src.proxyBaseUrlCustom,
      buildDefault,
    }),
    proxyBaseUrlCustom: src.proxyBaseUrlCustom === true,
    refreshSeconds: allowed.includes(refresh) ? refresh : DEFAULT_LIVE_CONFIG.refreshSeconds,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LIVE_CONFIG_KEY);
    return normalizeLiveConfig(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeLiveConfig({});
  }
}

let state = load();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeLiveConfig(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLiveConfig() {
  return state;
}

export function setLiveConfig(patch) {
  state = normalizeLiveConfig({ ...state, ...(patch || {}) });
  try {
    localStorage.setItem(LIVE_CONFIG_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时只保留内存值 */
  }
  emit();
  return state;
}

export function useLiveConfig() {
  return useSyncExternalStore(subscribeLiveConfig, getLiveConfig, getLiveConfig);
}

/** 测试用：重新从 localStorage 载入并通知订阅者 */
export function reloadLiveConfig() {
  state = load();
  emit();
  return state;
}

export function isLiveConfigured(config) {
  const c = config || state;
  if (!c || !c.enabled) return false;
  // 直连/自动模式不依赖代理地址；只有强制走代理时才要求填地址
  if (c.source === 'proxy') return Boolean(String(c.proxyBaseUrl || '').trim());
  return true;
}
