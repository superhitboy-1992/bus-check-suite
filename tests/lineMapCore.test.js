import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  buildLineMap,
  matchStationNames,
  normalizeStationName,
  summarizeLineMap,
} from '../tools/line-map-core';

describe('站名归一化', () => {
  it('统一全角半角括号并剥离括号内容', () => {
    expect(normalizeStationName('莲花路地铁站（北广场）')).toBe('莲花路地铁站');
    expect(normalizeStationName('莲花路地铁站(北广场)')).toBe('莲花路地铁站');
    expect(normalizeStationName('泾宾路枫湾路(枫岸华庭）')).toBe('泾宾路枫湾路');
  });

  it('去掉招呼站/单向等后缀与空白', () => {
    expect(normalizeStationName('思源路叶新公路(招呼站)')).toBe('思源路叶新公路');
    expect(normalizeStationName('枫阳路泾宾路(农兴苑)单向')).toBe('枫阳路泾宾路');
    expect(normalizeStationName(' 德贤路 中侨大学 ')).toBe('德贤路中侨大学');
  });
});

describe('站名匹配', () => {
  it('精确匹配优先，包含匹配标记为 fuzzy，匹配不到标记 missing', () => {
    const result = matchStationNames(
      ['莲花路地铁站(北广场)', '龙士路新溪街', '不存在的站'],
      [
        { stopId: '1', stopName: '莲花路地铁站（北广场）' },
        { stopId: '2', stopName: '龙士路新溪街东' },
      ]
    );
    expect(result.matched).toBe(2);
    expect(result.total).toBe(3);
    expect(result.rate).toBeCloseTo(2 / 3, 5);
    expect(result.matches[0]).toMatchObject({ stopId: '1', match: 'exact' });
    expect(result.matches[1]).toMatchObject({ stopId: '2', match: 'fuzzy' });
    expect(result.matches[2]).toMatchObject({ stopId: '', match: 'missing' });
  });

  it('接口站点不会被重复占用', () => {
    const result = matchStationNames(['甲站', '甲站'], [{ stopId: '1', stopName: '甲站' }]);
    expect(result.matches[0].stopId).toBe('1');
    expect(result.matches[1].match).toBe('missing');
  });
});

describe('生成线路映射', () => {
  const routes = ['1路', '空线路'];
  const stations = [
    { name: '甲站', routeName: '1路', sortOrder: 0 },
    { name: '乙站', routeName: '1路', sortOrder: 1 },
  ];
  const searchLine = async (routeName) =>
    routeName === '1路' ? [{ lineId: '900', lineName: '1路', startStopName: '甲站', endStopName: '乙站', upDown: 0 }] : [];
  const fetchStops = async ({ direction }) => ({
    upStartStop: direction === 0 ? '甲站' : '乙站',
    upEndStop: direction === 0 ? '乙站' : '甲站',
    stops:
      direction === 0
        ? [
            { stopId: '11', stopName: '甲站' },
            { stopId: '12', stopName: '乙站' },
          ]
        : [
            { stopId: '21', stopName: '乙站' },
            { stopId: '22', stopName: '甲站' },
          ],
  });

  it('两个方向都生成，并给出匹配率与 stopId', async () => {
    const map = await buildLineMap({ routes, stations, searchLine, fetchStops });
    expect(map.routes).toHaveLength(1);
    const route = map.routes[0];
    expect(route.routeName).toBe('1路');
    expect(route.lineId).toBe('900');
    expect(route.directions).toHaveLength(2);
    expect(route.bestRate).toBe(1);
    expect(route.directions[0].localMatches).toEqual([
      expect.objectContaining({ localName: '甲站', stopId: '11', match: 'exact' }),
      expect.objectContaining({ localName: '乙站', stopId: '12', match: 'exact' }),
    ]);
    expect(route.directions[1].stops[0]).toMatchObject({ seq: 1, name: '乙站', stopId: '21' });
  });

  it('本地没有站点的线路被跳过，搜不到线路时记录错误', async () => {
    const map = await buildLineMap({
      routes: ['空线路', '查不到线'],
      stations: [...stations, { name: '丙站', routeName: '查不到线', sortOrder: 0 }],
      searchLine: async () => [],
      fetchStops,
    });
    expect(map.routes).toHaveLength(1);
    expect(map.routes[0]).toMatchObject({ routeName: '查不到线', error: 'line_not_found' });
  });
});

describe('人工校对合并', () => {
  it('手动 stopId 覆盖生成结果并重算匹配率', async () => {
    const map = await buildLineMap({
      routes: ['1路'],
      stations: [
        { name: '甲站', routeName: '1路', sortOrder: 0 },
        { name: '乙站', routeName: '1路', sortOrder: 1 },
      ],
      searchLine: async () => [{ lineId: '900', lineName: '1路' }],
      fetchStops: async ({ direction }) => ({
        upStartStop: '甲站',
        upEndStop: '乙站',
        stops: direction === 0 ? [{ stopId: '11', stopName: '甲站' }] : [{ stopId: '21', stopName: '甲站' }],
      }),
    });
    expect(map.routes[0].bestRate).toBeCloseTo(0.5, 5);

    applyOverrides(map, { routes: [{ routeName: '1路', upDown: 0, localName: '乙站', stopId: '99', apiName: '乙站(新)' }] });
    const dir = map.routes[0].directions.find((d) => d.upDown === 0);
    expect(dir.localMatches.find((m) => m.localName === '乙站')).toMatchObject({ stopId: '99', match: 'manual' });
    expect(dir.coverage).toMatchObject({ matched: 2, total: 2, rate: 1 });
    expect(map.routes[0].bestRate).toBe(1);
  });

  it('没有校对内容时原样返回', () => {
    const map = { routes: [] };
    expect(applyOverrides(map, { routes: [] })).toBe(map);
  });
});

describe('映射汇总', () => {
  it('按匹配率分档统计', () => {
    const summary = summarizeLineMap({
      routes: [
        { routeName: 'A', localTotal: 10, bestRate: 1, directions: [{}] },
        { routeName: 'B', localTotal: 10, bestRate: 0.8, directions: [{}] },
        { routeName: 'C', localTotal: 10, bestRate: 0.3, directions: [{}] },
        { routeName: 'D', localTotal: 0, directions: [] },
      ],
    });
    expect(summary).toMatchObject({ full: 1, mid: 1, low: 1, total: 3 });
    expect(summary.routes[0].routeName).toBe('C');
  });
});
