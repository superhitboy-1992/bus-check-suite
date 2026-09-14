import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_STATUS, createTtlCache, loadArrivalRows } from '../src/lib/live/eta';
import {
  SOURCE_KIND,
  buildSources,
  createDirectSource,
  createProxySource,
  resetSourceHealth,
  shouldUseLocalSource,
  sourceKey,
} from '../src/lib/live/client';
import { UPSTREAM_PATHS } from '../src/lib/live/upstream';

const task = {
  routeName: '莲张专线',
  upDown: 0,
  toward: '德贤路中侨大学',
  stopName: '德贤路中侨大学',
  stopId: '21',
};

const proxyPayload = {
  status: 'running',
  buses: [{ plate: '沪A-53935D', stopsAway: 2, distanceMeters: 996, etaMinutes: 2, accessible: false, gps: '' }],
  schedule: { message: '', cars: [] },
  updatedAt: 1789401850001,
};

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function aborted() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

beforeEach(() => {
  resetSourceHealth();
});

describe('数据源选择', () => {
  it('auto：直连优先、有代理地址时附加代理；direct/proxy 各自只用一种', () => {
    const auto = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test/' });
    expect(auto.map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT, SOURCE_KIND.PROXY]);
    expect(auto[1].baseUrl).toBe('https://proxy.test');

    expect(buildSources({ source: 'auto', proxyBaseUrl: '' }).map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT]);
    expect(buildSources({ source: 'direct' }).map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT]);
    // 强制代理但没填地址 → 没有可用数据源
    expect(buildSources({ source: 'proxy', proxyBaseUrl: '  ' })).toEqual([]);
    expect(createProxySource('')).toBeNull();
  });

  it('数据源标识可区分直连与代理', () => {
    expect(sourceKey(createDirectSource())).toBe('direct:https://api.shmaas.net');
    expect(sourceKey(createProxySource('https://proxy.test'))).toBe('proxy:https://proxy.test');
  });

  it('本机/局域网页面上才试同源转发，线上域名不试', () => {
    expect(shouldUseLocalSource({ hostname: 'localhost' })).toBe(true);
    expect(shouldUseLocalSource({ hostname: '127.0.0.1' })).toBe(true);
    expect(shouldUseLocalSource({ hostname: '192.168.1.5' })).toBe(true);
    expect(shouldUseLocalSource({ hostname: '10.0.0.9' })).toBe(true);
    expect(shouldUseLocalSource({ hostname: '172.20.3.4' })).toBe(true);
    expect(shouldUseLocalSource({ hostname: '172.40.3.4' })).toBe(false);
    expect(shouldUseLocalSource({ hostname: 'example.github.io' })).toBe(false);
    expect(shouldUseLocalSource(undefined)).toBe(false);

    // 局域网打开的预览：直连（上游只放行 localhost）→ 同源转发 → 自建代理
    const lan = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }, { hostname: '192.168.1.5' });
    expect(lan.map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT, SOURCE_KIND.LOCAL, SOURCE_KIND.PROXY]);
    // 线上页面不试同源转发
    const pages = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }, { hostname: 'user.github.io' });
    expect(pages.map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT, SOURCE_KIND.PROXY]);
  });
});

describe('直连随申行', () => {
  it('直接请求上游并把 { errCode, data } 归一化成界面契约', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`https://api.shmaas.net${UPSTREAM_PATHS.eta}`);
      expect(init.headers['X-Saic-CityCode']).toBe('310100');
      expect(JSON.parse(init.body)).toMatchObject({ lineName: '莲张专线', stopId: '21', direction: '0' });
      return jsonResponse({
        errCode: 0,
        errMsg: '',
        now: 1789401850001,
        data: {
          stopArriveInfo: {
            currentLicensePlate: '沪A-53935D',
            currentBusStopCount: '2',
            currentBusDistance: '996',
            currentBusArriveTime: '2',
          },
          dispatchCarSchedule: { scheduleMsg: '', dispatchCars: [] },
        },
      });
    });

    const rows = await loadArrivalRows({
      sources: buildSources({ source: 'direct' }),
      tasks: [task],
      fetchImpl,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(LIVE_STATUS.RUNNING);
    expect(rows[0].first).toMatchObject({ plate: '沪A-53935D', stopsAway: 2, distanceMeters: 996, etaMinutes: 2 });
  });

  it('上游业务错误（errCode 非 0）当成失败行处理', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errCode: 500, errMsg: '系统繁忙', data: null }));
    const rows = await loadArrivalRows({
      sources: buildSources({ source: 'direct' }),
      tasks: [task],
      fetchImpl,
    });
    expect(rows[0].status).toBe(LIVE_STATUS.ERROR);
    expect(rows[0].error.code).toBe('upstream_error');
    expect(rows[0].error.message).toBe('系统繁忙');
  });
});

describe('自动回退', () => {
  it('直连超时时改用代理，之后的请求不再白等直连', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).startsWith('https://api.shmaas.net')) throw aborted();
      return jsonResponse(proxyPayload);
    });
    const sources = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' });

    const first = await loadArrivalRows({ sources, tasks: [task], fetchImpl });
    expect(first[0].status).toBe(LIVE_STATUS.RUNNING);
    expect(calls).toEqual(['https://api.shmaas.net/traffic/v1/getbusstoparrivedetails', 'https://proxy.test/api/bus/eta']);

    calls.length = 0;
    const second = await loadArrivalRows({ sources, tasks: [task], cache: createTtlCache({ ttlMs: 0 }), fetchImpl });
    expect(second[0].status).toBe(LIVE_STATUS.RUNNING);
    expect(calls).toEqual(['https://proxy.test/api/bus/eta']);
  });

  it('两个数据源都不通时给出失败行，错误码来自最后一次尝试', async () => {
    const fetchImpl = vi.fn(async () => {
      throw aborted();
    });
    const rows = await loadArrivalRows({
      sources: buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }),
      tasks: [task],
      fetchImpl,
    });
    expect(rows[0].status).toBe(LIVE_STATUS.ERROR);
    expect(rows[0].error.code).toBe('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
