/* 实时到站配置：代理地址、刷新间隔、开关。
   存在浏览器 localStorage，不进备份必需字段，缺失或非法时按未配置处理。 */
import { useSyncExternalStore } from 'react';

export const LIVE_CONFIG_KEY = 'busCheck.liveConfig';

// 刷新间隔选项（秒），0 表示只手动刷新
export const REFRESH_OPTIONS = [
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '60 秒' },
  { value: 0, label: '手动刷新' },
];

const BUILD_DEFAULT_PROXY =
  (import.meta && import.meta.env && import.meta.env.VITE_LIVE_PROXY_BASE) || '';

// 已部署的 Cloudflare Worker 代理地址。注意：*.workers.dev 在部分国内网络下
// 会被 DNS 投毒/SNI 阻断，若打不开可在「基础数据 → 实时数据源」里换成自定义域名，
// 或用构建变量 VITE_LIVE_PROXY_BASE 覆盖。
export const DEPLOYED_PROXY_BASE = 'https://bus-live-proxy.1015184868.workers.dev';

export const DEFAULT_LIVE_CONFIG = {
  enabled: true,
  proxyBaseUrl: String(BUILD_DEFAULT_PROXY || DEPLOYED_PROXY_BASE).trim(),
  refreshSeconds: 30,
};

export function normalizeLiveConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const refresh = Number(src.refreshSeconds);
  const allowed = REFRESH_OPTIONS.map((o) => o.value);
  return {
    enabled: src.enabled === undefined ? DEFAULT_LIVE_CONFIG.enabled : src.enabled !== false,
    proxyBaseUrl: String(src.proxyBaseUrl === undefined ? DEFAULT_LIVE_CONFIG.proxyBaseUrl : src.proxyBaseUrl || '').trim(),
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
  return Boolean(c && c.enabled && String(c.proxyBaseUrl || '').trim());
}
