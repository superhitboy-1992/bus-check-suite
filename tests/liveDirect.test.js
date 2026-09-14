import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_STATUS, createTtlCache, loadArrivalRows } from '../src/lib/live/eta';
import {
  SOURCE_KIND,
  buildSources,
  createDirectSource,
  createLocalSource,
  createProxySource,
  resetSourceHealth,
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
  it('auto：直连 → 同源转发 → 代理；direct/proxy 各自只用一种', () => {
    const auto = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test/' });
    expect(auto.map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT, SOURCE_KIND.LOCAL, SOURCE_KIND.PROXY]);
    expect(auto[2].baseUrl).toBe('https://proxy.test');

    expect(buildSources({ source: 'auto', proxyBaseUrl: '' }).map((s) => s.kind)).toEqual([
      SOURCE_KIND.DIRECT,
      SOURCE_KIND.LOCAL,
    ]);
    expect(buildSources({ source: 'direct' }).map((s) => s.kind)).toEqual([SOURCE_KIND.DIRECT]);
    // 强制代理但没填地址 → 没有可用数据源
    expect(buildSources({ source: 'proxy', proxyBaseUrl: '  ' })).toEqual([]);
    expect(createProxySource('')).toBeNull();
  });

  it('数据源标识可区分直连与代理', () => {
    expect(sourceKey(createDirectSource())).toBe('direct:https://api.shmaas.net');
    expect(sourceKey(createProxySource('https://proxy.test'))).toBe('proxy:https://proxy.test');
  });

  it('自动模式：直连 → 同源转发 → 自建代理（同源转发对 Netlify 这类部署自动生效）', () => {
    const kinds = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }).map((s) => s.kind);
    expect(kinds).toEqual([SOURCE_KIND.DIRECT, SOURCE_KIND.LOCAL, SOURCE_KIND.PROXY]);
    // 没填代理地址时也保留同源转发
    expect(buildSources({ source: 'auto', proxyBaseUrl: '' }).map((s) => s.kind)).toEqual([
      SOURCE_KIND.DIRECT,
      SOURCE_KIND.LOCAL,
    ]);
  });
});

describe('同源转发', () => {
  it('相对路径请求 /api/bus/eta，返回结构与代理一致时正常成行', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url) => {
      calls.push(String(url));
      return jsonResponse(proxyPayload);
    });
    const rows = await loadArrivalRows({
      sources: [createLocalSource()],
      tasks: [task],
      fetchImpl,
    });
    expect(calls).toEqual(['/api/bus/eta']);
    expect(rows[0].status).toBe(LIVE_STATUS.RUNNING);
  });

  it('同源路径不是实时接口（例如静态托管回 200 的 HTML）时算失败，会换下一个数据源', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).startsWith('/api/bus/eta')) return jsonResponse({ hello: 'index.html' });
      return jsonResponse(proxyPayload);
    });
    const rows = await loadArrivalRows({
      sources: buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }).filter(
        (s) => s.kind !== SOURCE_KIND.DIRECT
      ),
      tasks: [task],
      fetchImpl,
    });
    expect(rows[0].status).toBe(LIVE_STATUS.RUNNING);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
    // 这里只比较直连与自建代理两条路（同源转发另有专门用例）
    const sources = buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }).filter(
      (s) => s.kind !== SOURCE_KIND.LOCAL
    );

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
      sources: buildSources({ source: 'auto', proxyBaseUrl: 'https://proxy.test' }).filter(
        (s) => s.kind !== SOURCE_KIND.LOCAL
      ),
      tasks: [task],
      fetchImpl,
    });
    expect(rows[0].status).toBe(LIVE_STATUS.ERROR);
    expect(rows[0].error.code).toBe('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
