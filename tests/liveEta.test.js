import { describe, expect, it, vi } from 'vitest';
import {
  LIVE_STATUS,
  createTtlCache,
  loadArrivalRows,
  mapWithConcurrency,
  parseEta,
  sortRows,
} from '../src/lib/live/eta';
import { routesServingStation } from '../src/lib/live/stationRoutes';
import { buildLineMapIndex, findStops } from '../src/lib/live/lineMap';

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

describe('实时数据解析', () => {
  it('有车在途：车牌 / 还有几站 / 距离 / 分钟', () => {
    const parsed = parseEta({
      status: 'running',
      buses: [{ plate: '沪A-13762A', stopsAway: 1, distanceMeters: 370, etaMinutes: 2, accessible: false, gps: '' }],
      schedule: { message: '', cars: [] },
      updatedAt: 1700000000000,
    });
    expect(parsed.status).toBe(LIVE_STATUS.RUNNING);
    expect(parsed.buses).toHaveLength(1);
    expect(parsed.buses[0]).toMatchObject({ plate: '沪A-13762A', stopsAway: 1, distanceMeters: 370, etaMinutes: 2 });
  });

  it('无在途车但有排班 → waiting；只有不在运营提示 → closed', () => {
    const waiting = parseEta({ buses: [], schedule: { message: '', cars: [{ vehicle: '沪A-1', time: '06:00', countdown: '12' }] } });
    expect(waiting.status).toBe(LIVE_STATUS.WAITING);
    expect(waiting.schedule.cars[0].countdown).toBe('12');

    const closed = parseEta({ buses: [], schedule: { message: '预计04:40从首站发车', cars: [] } });
    expect(closed.status).toBe(LIVE_STATUS.CLOSED);
    expect(closed.schedule.message).toBe('预计04:40从首站发车');
  });

  it('异常输入不炸：空值按 waiting 处理，脏数据被丢弃', () => {
    expect(parseEta(null)).toMatchObject({ status: LIVE_STATUS.WAITING, buses: [] });
    const parsed = parseEta({ buses: [null, { plate: '' }, { plate: '沪A-2', stopsAway: '3', etaMinutes: '5' }] });
    expect(parsed.buses).toHaveLength(1);
    expect(parsed.buses[0]).toMatchObject({ plate: '沪A-2', stopsAway: 3, etaMinutes: 5 });
  });

  it('车牌里带无障碍字样时标为无障碍车', () => {
    const parsed = parseEta({ buses: [{ plate: '沪A-51677D无障碍', stopsAway: 1 }] });
    expect(parsed.buses[0].accessible).toBe(true);
  });
});

describe('排序', () => {
  it('在途（按到达升序）→ 等待发车 → 不在运营时间 → 失败', () => {
    const rows = [
      { key: 'c', routeName: 'C', upDown: 0, status: LIVE_STATUS.CLOSED, schedule: { cars: [] }, first: null },
      { key: 'e', routeName: 'E', upDown: 0, status: LIVE_STATUS.ERROR, schedule: { cars: [] }, first: null },
      { key: 'a2', routeName: 'A', upDown: 1, status: LIVE_STATUS.RUNNING, schedule: { cars: [] }, first: { etaMinutes: 9 } },
      { key: 'a1', routeName: 'A', upDown: 0, status: LIVE_STATUS.RUNNING, schedule: { cars: [] }, first: { etaMinutes: 2 } },
      { key: 'b', routeName: 'B', upDown: 0, status: LIVE_STATUS.WAITING, schedule: { cars: [{ countdown: '4' }] }, first: null },
    ];
    expect(sortRows(rows).map((r) => r.key)).toEqual(['a1', 'a2', 'b', 'c', 'e']);
  });
});

describe('TTL 缓存', () => {
  it('过期后视为未命中', () => {
    let now = 1000;
    const cache = createTtlCache({ ttlMs: 100, now: () => now });
    cache.set('k', { v: 1 });
    expect(cache.get('k')).toEqual({ v: 1 });
    now = 1099;
    expect(cache.get('k')).toEqual({ v: 1 });
    now = 1101;
    expect(cache.get('k')).toBeNull();
    // 过期条目保留供兜底展示，超过 maxAgeMs 后才会被清理
    expect(cache.size).toBe(1);
  });

  it('getStale 能取到已过期的值', () => {
    let now = 1000;
    const cache = createTtlCache({ ttlMs: 100, now: () => now });
    cache.set('k', { v: 1 });
    now = 5000;
    expect(cache.get('k')).toBeNull();
    expect(cache.getStale('k')).toMatchObject({ value: { v: 1 }, at: 1000 });
  });
});

describe('并发控制', () => {
  it('同时最多跑 limit 个任务，且结果顺序与入参一致', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });
});

describe('批量取到站数据', () => {
  const tasks = [
    { routeName: '莲张专线', upDown: 1, toward: '莲花路地铁站(北广场)', stopName: '松金公路张堰', stopId: '4' },
    { routeName: '莲卫专线', upDown: 0, toward: '莲花路地铁站(北广场)', stopName: '松金公路张堰', stopId: '9' },
  ];

  it('命中缓存时不再请求，返回归一化行', async () => {
    const cache = createTtlCache({ ttlMs: 20000 });
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        status: 'running',
        buses: [{ plate: '沪A-13762A', stopsAway: 1, distanceMeters: 370, etaMinutes: 2 }],
        schedule: { message: '', cars: [] },
      })
    );
    const first = await loadArrivalRows({ proxyBaseUrl: 'https://proxy.test', tasks, cache, fetchImpl });
    expect(first).toHaveLength(2);
    const lianzhang = first.find((r) => r.routeName === '莲张专线');
    expect(lianzhang).toMatchObject({ directionLabel: '下行', status: LIVE_STATUS.RUNNING });
    expect(lianzhang.first.plate).toBe('沪A-13762A');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const second = await loadArrivalRows({ proxyBaseUrl: 'https://proxy.test', tasks, cache, fetchImpl });
    expect(second).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 全部命中缓存
  });

  it('单条线路失败只影响那一行', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.lineName === '莲卫专线') return { ok: false, status: 502, json: async () => ({ error: 'upstream_error', error_msg: '上游不可用' }) };
      return jsonResponse({ status: 'closed', buses: [], schedule: { message: '不在运营时间', cars: [] } });
    });
    const rows = await loadArrivalRows({ proxyBaseUrl: 'https://proxy.test', tasks, fetchImpl });
    const failed = rows.find((r) => r.routeName === '莲卫专线');
    const ok = rows.find((r) => r.routeName === '莲张专线');
    expect(failed.status).toBe(LIVE_STATUS.ERROR);
    expect(failed.error.code).toBe('upstream_error');
    expect(ok.status).toBe(LIVE_STATUS.CLOSED);
  });

  it('请求失败但有上次数据时标记为旧数据，仍展示车牌', async () => {
    let clock = 1000;
    const cache = createTtlCache({ ttlMs: 100, now: () => clock });
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) return { ok: false, status: 502, json: async () => ({ error: 'upstream_error' }) };
      return jsonResponse({
        status: 'running',
        buses: [{ plate: '沪A-13762A', stopsAway: 1, distanceMeters: 370, etaMinutes: 2 }],
        schedule: { message: '', cars: [] },
      });
    });
    await loadArrivalRows({ proxyBaseUrl: 'https://proxy.test', tasks: [tasks[0]], cache, fetchImpl });
    clock = 5000; // 缓存过期，强制重新请求
    fail = true;
    const rows = await loadArrivalRows({ proxyBaseUrl: 'https://proxy.test', tasks: [tasks[0]], cache, fetchImpl });
    expect(rows[0].stale).toBe(true);
    expect(rows[0].first.plate).toBe('沪A-13762A');
    expect(rows[0].status).toBe(LIVE_STATUS.RUNNING);
    expect(rows[0].error.code).toBe('upstream_error');
  });
});

describe('站点反查与映射查询', () => {
  it('同一站点名可反查出多条线路，且去重', () => {
    const stations = [
      { name: '松金公路张堰', routeName: '莲张专线', sortOrder: 4 },
      { name: '松金公路张堰', routeName: '莲卫专线', sortOrder: 20 },
      { name: '松金公路张堰', routeName: '莲张专线', sortOrder: 4 },
      { name: '其它站', routeName: '朱枫线', sortOrder: 0 },
    ];
    expect(routesServingStation(stations, '松金公路张堰')).toEqual(['莲张专线', '莲卫专线']);
    expect(routesServingStation(stations, '不存在站')).toEqual([]);
  });

  it('按站点名查到各方向的 stopId 与终点站', () => {
    const index = buildLineMapIndex({
      routes: [
        {
          routeName: '莲张专线',
          lineId: '1249',
          directions: [
            {
              upDown: 1,
              startStop: '德贤路中侨大学',
              endStop: '莲花路地铁站(北广场)',
              localMatches: [{ localName: '松金公路张堰', stopId: '4', apiName: '松金公路张堰', match: 'exact' }],
            },
            {
              upDown: 0,
              startStop: '莲花路地铁站(北广场)',
              endStop: '德贤路中侨大学',
              localMatches: [
                { localName: '松金公路张堰', stopId: '18', apiName: '松金公路张堰', match: 'exact' },
                { localName: '没匹配的站', stopId: '', apiName: '', match: 'missing' },
              ],
            },
          ],
        },
      ],
    });
    const stops = findStops(index, '莲张专线', '松金公路张堰');
    expect(stops.map((s) => s.upDown)).toEqual([0, 1]);
    expect(stops[0]).toMatchObject({ stopId: '18', toward: '德贤路中侨大学' });
    expect(stops[1]).toMatchObject({ stopId: '4', toward: '莲花路地铁站(北广场)' });
    expect(findStops(index, '莲张专线', '没匹配的站')).toEqual([]);
    expect(findStops(index, '不存在的线', '松金公路张堰')).toEqual([]);
  });
});
