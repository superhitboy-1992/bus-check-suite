// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { replaceAllData, saveStationLast } from '../src/lib/storage';
import { setLiveConfig } from '../src/lib/live/config';
import { resetLineMapCache } from '../src/lib/live/lineMap';
import { clearLiveCache } from '../src/lib/live/useStationLive';

const STATION = '松金公路张堰';

const seededData = {
  records: [],
  stationRecords: [],
  basicData: {
    routes: [{ id: 'r1', name: '莲张专线', fleet: '' }],
    stations: [{ id: 's1', name: STATION, routeName: '莲张专线', sortOrder: 4 }],
    plates: [],
    inspectors: [],
    drivers: [],
    conductors: [],
    fleets: [],
  },
};

const lineMapFixture = {
  updatedAt: '2026-09-14T00:00:00.000Z',
  routes: [
    {
      routeName: '莲张专线',
      lineId: '1249',
      localTotal: 1,
      bestRate: 1,
      directions: [
        {
          upDown: 1,
          startStop: '德贤路中侨大学',
          endStop: '莲花路地铁站(北广场)',
          localMatches: [{ localName: STATION, stopId: '4', apiName: STATION, seq: 4, match: 'exact' }],
        },
        {
          upDown: 0,
          startStop: '莲花路地铁站(北广场)',
          endStop: '德贤路中侨大学',
          localMatches: [{ localName: STATION, stopId: '18', apiName: STATION, seq: 18, match: 'exact' }],
        },
      ],
    },
  ],
};

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function installFetch({ etaImpl } = {}) {
  const fn = vi.fn(async (url, init) => {
    const target = String(url);
    if (target.includes('line-map.json')) return jsonResponse(lineMapFixture);
    if (target.includes('/api/bus/eta')) {
      const body = init && init.body ? JSON.parse(init.body) : {};
      if (etaImpl) return etaImpl(body);
      return jsonResponse({
        status: 'running',
        buses: [
          {
            plate: '沪A-13762A',
            stopsAway: 1,
            distanceMeters: 370,
            etaMinutes: 2,
            accessible: false,
            gps: '',
          },
        ],
        schedule: { message: '', cars: [] },
        updatedAt: Date.now(),
      });
    }
    return jsonResponse({}, false, 404);
  });
  globalThis.fetch = fn;
  return fn;
}

function renderStationReg() {
  window.location.hash = '#/station/reg';
  return render(<App />);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  resetLineMapCache();
  clearLiveCache();
  replaceAllData(seededData);
  saveStationLast({ station: STATION, checker: '张三', date: '' });
});

describe('驻站实时到站面板', () => {
  it('未配置代理时给出配置入口，且不请求上游', async () => {
    setLiveConfig({ proxyBaseUrl: '', enabled: true });
    const fetchMock = installFetch();
    renderStationReg();

    fireEvent.click(screen.getByText('本站实时到站'));
    expect(await screen.findByText('去配置数据源')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('已关闭时说明原因而不是要求重新配置', async () => {
    setLiveConfig({ proxyBaseUrl: 'https://proxy.test', enabled: false });
    const fetchMock = installFetch();
    renderStationReg();

    fireEvent.click(screen.getByText('本站实时到站'));
    expect(await screen.findByText('实时到站已在「基础数据 → 实时数据源」里关闭。')).toBeTruthy();
    expect(screen.getByText('已关闭')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('配置代理后展开才拉数据，并显示车牌与预计分钟', async () => {
    setLiveConfig({ proxyBaseUrl: 'https://proxy.test', enabled: true, refreshSeconds: 30 });
    const fetchMock = installFetch();
    renderStationReg();

    // 收起状态不请求
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('本站实时到站'));
    // 上下行分开显示：两个方向各一行，同一辆车出现两次
    await waitFor(() => {
      expect(screen.getAllByText('沪A-13762A')).toHaveLength(2);
    });
    expect(screen.getAllByText('约 2 分钟')).toHaveLength(2);
    expect(screen.getAllByText('还有 1 站 · 370 米')).toHaveLength(2);
    // 备注区也有「上行/下行」快捷词，这里限定在面板内断言方向标注
    const panel = screen.getByText('本站实时到站').closest('div.overflow-hidden');
    expect(within(panel).getByText('上行')).toBeTruthy();
    expect(within(panel).getByText('下行')).toBeTruthy();
    expect(within(panel).getByText('往 莲花路地铁站(北广场)')).toBeTruthy();
    expect(within(panel).getByText('往 德贤路中侨大学')).toBeTruthy();
  });

  it('请求失败时提示失败并可重试', async () => {
    setLiveConfig({ proxyBaseUrl: 'https://proxy.test', enabled: true, refreshSeconds: 30 });
    installFetch({
      etaImpl: () => jsonResponse({ error: 'upstream_error', error_msg: '数据源暂时不可用' }, false, 502),
    });
    renderStationReg();

    fireEvent.click(screen.getByText('本站实时到站'));
    expect(await screen.findByText(/实时数据获取失败/)).toBeTruthy();
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('站点未匹配到映射时给出提示', async () => {
    setLiveConfig({ proxyBaseUrl: 'https://proxy.test', enabled: true, refreshSeconds: 30 });
    installFetch();
    replaceAllData({
      ...seededData,
      basicData: {
        ...seededData.basicData,
        stations: [{ id: 's1', name: '没映射的站', routeName: '莲张专线', sortOrder: 1 }],
      },
    });
    saveStationLast({ station: '没映射的站', checker: '张三', date: '' });
    renderStationReg();

    fireEvent.click(screen.getByText('本站实时到站'));
    await waitFor(() => {
      expect(screen.getByText(/没有匹配到实时数据/)).toBeTruthy();
    });
  });
});
