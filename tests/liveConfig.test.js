// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_CONFIG,
  DEPLOYED_PROXY_BASE,
  LIVE_CONFIG_KEY,
  getLiveConfig,
  isLiveConfigured,
  migrateProxyBaseUrl,
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
    expect(cfg).toMatchObject({
      enabled: true,
      source: 'auto',
      proxyBaseUrl: DEPLOYED_PROXY_BASE,
      refreshSeconds: 30,
    });
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

  it('已关闭时视为不可用', () => {
    expect(isLiveConfigured({ enabled: true, proxyBaseUrl: DEPLOYED_PROXY_BASE })).toBe(true);
    expect(isLiveConfigured({ enabled: false, proxyBaseUrl: DEPLOYED_PROXY_BASE })).toBe(false);
  });

  it('直连/自动模式不依赖代理地址，强制走代理时才要求填地址', () => {
    expect(isLiveConfigured({ enabled: true, source: 'auto', proxyBaseUrl: '' })).toBe(true);
    expect(isLiveConfigured({ enabled: true, source: 'direct', proxyBaseUrl: '' })).toBe(true);
    expect(isLiveConfigured({ enabled: true, source: 'proxy', proxyBaseUrl: '   ' })).toBe(false);
    expect(isLiveConfigured({ enabled: true, source: 'proxy', proxyBaseUrl: DEPLOYED_PROXY_BASE })).toBe(true);
  });

  it('非法数据源回落到 auto', () => {
    expect(normalizeLiveConfig({ source: 'svn' }).source).toBe('auto');
    expect(normalizeLiveConfig({ source: 'proxy' }).source).toBe('proxy');
  });

  it('沿用旧内置默认地址的设备，自动切到新的构建默认值', () => {
    const next = 'https://friendly-lily-0cb4b5.netlify.app';
    // 老设备：localStorage 里存着旧默认地址，且不是手动填的
    expect(migrateProxyBaseUrl({ stored: DEPLOYED_PROXY_BASE, custom: false, buildDefault: next })).toBe(next);
    expect(normalizeLiveConfig({ proxyBaseUrl: DEPLOYED_PROXY_BASE }, next).proxyBaseUrl).toBe(next);
    // 手动填过的一律沿用（哪怕填的就是旧地址）
    expect(migrateProxyBaseUrl({ stored: DEPLOYED_PROXY_BASE, custom: true, buildDefault: next })).toBe(
      DEPLOYED_PROXY_BASE
    );
    // 没存过 → 用构建默认值；清空过 → 保持清空
    expect(migrateProxyBaseUrl({ stored: undefined, custom: false, buildDefault: next })).toBe(next);
    expect(migrateProxyBaseUrl({ stored: '', custom: true, buildDefault: next })).toBe('');
    // 构建默认值没变时不动它
    expect(migrateProxyBaseUrl({ stored: DEPLOYED_PROXY_BASE, custom: false, buildDefault: DEPLOYED_PROXY_BASE })).toBe(
      DEPLOYED_PROXY_BASE
    );
  });
});
