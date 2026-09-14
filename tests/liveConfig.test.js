// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_CONFIG,
  DEPLOYED_PROXY_BASE,
  LIVE_CONFIG_KEY,
  getLiveConfig,
  isLiveConfigured,
  normalizeLiveConfig,
  reloadLiveConfig,
  setLiveConfig,
} from '../src/lib/live/config';

beforeEach(() => {
  localStorage.clear();
  reloadLiveConfig();
});

describe('实时到站配置', () => {
  it('默认使用已部署的代理地址与 30 秒刷新', () => {
    expect(DEFAULT_LIVE_CONFIG.proxyBaseUrl).toBe(DEPLOYED_PROXY_BASE);
    const cfg = normalizeLiveConfig({});
    expect(cfg).toMatchObject({ enabled: true, proxyBaseUrl: DEPLOYED_PROXY_BASE, refreshSeconds: 30 });
  });

  it('非法刷新间隔回落到默认值', () => {
    expect(normalizeLiveConfig({ refreshSeconds: 7 }).refreshSeconds).toBe(30);
    expect(normalizeLiveConfig({ refreshSeconds: 0 }).refreshSeconds).toBe(0);
    expect(normalizeLiveConfig({ refreshSeconds: '15' }).refreshSeconds).toBe(15);
  });

  it('保存后写入 localStorage 并可读回，未被覆盖时沿用本地值', () => {
    setLiveConfig({ proxyBaseUrl: 'https://proxy.example.com/', enabled: false });
    expect(getLiveConfig().proxyBaseUrl).toBe('https://proxy.example.com/');
    expect(getLiveConfig().enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(LIVE_CONFIG_KEY)).enabled).toBe(false);

    reloadLiveConfig();
    expect(getLiveConfig()).toMatchObject({ proxyBaseUrl: 'https://proxy.example.com/', enabled: false });
  });

  it('未配置或已关闭时都视为不可用', () => {
    expect(isLiveConfigured({ enabled: true, proxyBaseUrl: DEPLOYED_PROXY_BASE })).toBe(true);
    expect(isLiveConfigured({ enabled: true, proxyBaseUrl: '   ' })).toBe(false);
    expect(isLiveConfigured({ enabled: false, proxyBaseUrl: DEPLOYED_PROXY_BASE })).toBe(false);
  });
});
