import { describe, expect, it } from 'vitest';
import {
  createStationComparator,
  sortStationsByRoute,
  stationNameOptions,
} from '../src/lib/stationOrder';

const routes = [{ id: 'rt1', name: '1路' }, { id: 'rt2', name: '2路' }];

// 模拟线上更新后的本地数组：老站留在原位（sortOrder 被更新）、新站追加到末尾
const stations = [
  { id: 'a1', name: '老站甲', routeName: '1路', sortOrder: 2 },
  { id: 'b1', name: '二路首站', routeName: '2路', sortOrder: 0 },
  { id: 'a2', name: '老站乙', routeName: '1路', sortOrder: 0 },
  { id: 'a3', name: '更新新增站', routeName: '1路', sortOrder: 1 },
  { id: 'b2', name: '二路末站', routeName: '2路', sortOrder: 1 },
];

describe('站点排序（线路顺序 + 站序）', () => {
  it('按线路顺序分组、组内按 sortOrder 升序，不改写入参', () => {
    const sorted = sortStationsByRoute(stations, routes);
    expect(sorted.map((s) => s.name)).toEqual([
      '老站乙',
      '更新新增站',
      '老站甲',
      '二路首站',
      '二路末站',
    ]);
    expect(stations.map((s) => s.name)[0]).toBe('老站甲'); // 原数组未被改动
  });

  it('sortOrder 相同或缺失时保持原有相对顺序', () => {
    const list = [
      { id: 'x1', name: '先', routeName: '1路' },
      { id: 'x2', name: '后', routeName: '1路' },
      { id: 'x3', name: 'other', routeName: '1路', sortOrder: 5 },
    ];
    expect(sortStationsByRoute(list, routes).map((s) => s.name)).toEqual(['先', '后', 'other']);
  });

  it('通用站点与不在名单里的本地线路排最后', () => {
    const list = [
      { id: 'g1', name: '通用站', routeName: '' },
      { id: 'u1', name: '私加线路站', routeName: '私人线路' },
      { id: 'a1', name: '一路站', routeName: '1路', sortOrder: 0 },
    ];
    const names = sortStationsByRoute(list, routes).map((s) => s.name);
    expect(names[0]).toBe('一路站');
    expect(names.slice(1)).toHaveLength(2);
    expect(names.slice(1)).toEqual(expect.arrayContaining(['通用站', '私加线路站']));
  });

  it('比较器可与稳定排序配合使用', () => {
    const compare = createStationComparator(routes);
    const a = { name: '老站甲', routeName: '1路', sortOrder: 2 };
    const b = { name: '老站乙', routeName: '1路', sortOrder: 0 };
    expect(compare(b, a)).toBeLessThan(0);
    expect(compare(a, a)).toBe(0);
  });
});

describe('站点选择项（stationNameOptions）', () => {
  it('过滤停用站点、按站名去重且保留排序后首次出现的位置', () => {
    const list = [
      { id: 's1', name: '共线站', routeName: '2路', sortOrder: 0 },
      { id: 's2', name: '共线站', routeName: '1路', sortOrder: 1 },
      { id: 's3', name: '一路首站', routeName: '1路', sortOrder: 0 },
      { id: 's4', name: '停用站', routeName: '1路', sortOrder: 2, retired: true },
    ];
    expect(stationNameOptions(list, routes)).toEqual(['一路首站', '共线站']);
    expect(stationNameOptions(list, routes, { routeName: '2路' })).toEqual(['共线站']);
    expect(stationNameOptions(list, routes, { includeRetired: true })).toEqual([
      '一路首站',
      '共线站',
      '停用站',
    ]);
  });

  it('只看某条线路时按站序排列', () => {
    expect(stationNameOptions(stations, routes, { routeName: '1路' })).toEqual([
      '老站乙',
      '更新新增站',
      '老站甲',
    ]);
    expect(stationNameOptions(stations, routes, { routeName: '2路' })).toEqual([
      '二路首站',
      '二路末站',
    ]);
  });
});
