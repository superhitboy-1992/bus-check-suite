// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFleetMap,
  hashCatalogData,
  mergeCatalogData,
  normalizeRemoteCatalog,
  validateRemoteCatalog,
} from '../src/lib/remoteCatalog';

const emptyData = {
  records: [],
  stationRecords: [],
  basicData: { routes: [], stations: [], plates: [], inspectors: [], drivers: [], conductors: [], fleets: [] },
};

async function importStorage() {
  vi.resetModules();
  return await import('../src/lib/storage');
}

function mockFetch(payload, { ok = true, fail = false } = {}) {
  const fn = vi.fn();
  if (fail) {
    fn.mockRejectedValue(new TypeError('Failed to fetch'));
  } else {
    fn.mockResolvedValue({ ok, json: async () => payload });
  }
  globalThis.fetch = fn;
  return fn;
}

function validRemote(overrides = {}) {
  return {
    updatedAt: '2026-08-30T10:00:00+08:00',
    stations: [{ name: '新站', routeName: '新线', sortOrder: 0 }],
    routes: ['新线'],
    checkers: ['远程检查人'],
    fleets: [{ name: '新车队', routes: ['新线'] }],
    drivers: [{ name: '新司机', routeName: '新线' }],
    conductors: [],
    ...overrides,
  };
}

describe('远程数据哈希与校验', () => {
  it('哈希不受对象键顺序影响', () => {
    const a = { stations: [{ name: '站1', routeName: '1路', sortOrder: 0 }], routes: ['1路'] };
    const b = { routes: ['1路'], stations: [{ sortOrder: 0, routeName: '1路', name: '站1' }] };
    expect(hashCatalogData(a)).toBe(hashCatalogData(b));
  });

  it('哈希忽略 updatedAt（仅展示用）', () => {
    const a = { routes: ['1路'], updatedAt: '2026-01-01' };
    const b = { routes: ['1路'], updatedAt: '2026-02-02' };
    expect(hashCatalogData(a)).toBe(hashCatalogData(b));
  });

  it('内容不同则哈希不同', () => {
    expect(hashCatalogData({ routes: ['1路'] })).not.toBe(hashCatalogData({ routes: ['1路', '2路'] }));
  });

  it('结构校验：必需字段齐全且站点/线路/驻站人非空才通过', () => {
    expect(validateRemoteCatalog(validRemote())).toBe(true);
    expect(validateRemoteCatalog({ stations: [], routes: [], checkers: [], fleets: [], drivers: [], conductors: [] })).toBe(false);
    expect(validateRemoteCatalog({ stations: [{ name: '站' }], routes: ['1路'], checkers: [] })).toBe(false);
    expect(validateRemoteCatalog({ stations: 'x', routes: [], checkers: [] })).toBe(false);
    expect(validateRemoteCatalog(null)).toBe(false);
    expect(validateRemoteCatalog([])).toBe(false);
  });
});

describe('增量合并（纯函数）', () => {
  const local = {
    routes: [
      { id: 'r1', name: '1路', fleet: '' },
      { id: 'r2', name: '2路', fleet: '一车队' },
    ],
    stations: [{ id: 's1', name: '总站', routeName: '', sortOrder: 0 }],
    plates: ['沪A1'],
    inspectors: ['本地检查人'],
    drivers: [{ id: 'd1', name: '张三', routeName: '1路' }],
    conductors: [{ id: 'c1', name: '李四', routeName: '1路' }],
    fleets: ['一车队'],
  };

  it('新增条目加入、本地独有保留、远程同名覆盖、不删除', () => {
    const remote = normalizeRemoteCatalog(
      validRemote({
        stations: [
          { name: '新站', routeName: '新线', sortOrder: 5 },
          { name: '总站', routeName: '', sortOrder: 9 },
        ],
        routes: ['1路', '新线'],
        drivers: [
          { name: '张三', routeName: '2路' },
          { name: '王五', routeName: '新线' },
        ],
      })
    );
    const merged = mergeCatalogData(local, remote, buildFleetMap(validRemote()));

    expect(merged.routes.map((r) => r.name)).toEqual(['1路', '2路', '新线']);
    expect(merged.routes.find((r) => r.name === '1路').id).toBe('r1');
    expect(merged.routes.find((r) => r.name === '新线').fleet).toBe('新车队');
    // 已有手工归属的线路不被覆盖
    expect(merged.routes.find((r) => r.name === '2路').fleet).toBe('一车队');

    expect(merged.stations).toHaveLength(2);
    const station = merged.stations.find((s) => s.name === '总站');
    expect(station.id).toBe('s1');
    expect(station.sortOrder).toBe(9); // 远程覆盖 sortOrder
    expect(merged.stations.some((s) => s.name === '新站' && s.routeName === '新线')).toBe(true);

    expect(merged.plates).toEqual(['沪A1']);
    expect(merged.inspectors).toEqual(['本地检查人', '远程检查人']);
    expect(merged.fleets).toEqual(['一车队', '新车队']);

    expect(merged.drivers).toHaveLength(2);
    const zhang = merged.drivers.find((d) => d.name === '张三');
    expect(zhang.routeName).toBe('2路'); // 远程覆盖线路归属
    expect(zhang.id).toBe('d1'); // 保留本地 id
    expect(merged.drivers.some((d) => d.name === '王五')).toBe(true);
    expect(merged.conductors).toHaveLength(1); // 本地独有保留
  });

  it('站点以 名称|线路 为键：同站名不同线路各自保留', () => {
    const remote = normalizeRemoteCatalog(
      validRemote({
        stations: [{ name: '人民广场', routeName: '3路', sortOrder: 0 }],
      })
    );
    const base = {
      ...local,
      stations: [
        { id: 'p1', name: '人民广场', routeName: '1路', sortOrder: 0 },
        { id: 'p2', name: '人民广场', routeName: '2路', sortOrder: 1 },
      ],
    };
    const merged = mergeCatalogData(base, remote, new Map());
    expect(merged.stations).toHaveLength(3);
    const p1 = merged.stations.find((s) => s.id === 'p1');
    expect(p1.routeName).toBe('1路');
    expect(merged.stations.find((s) => s.id === 'p2')).toBeTruthy();
    expect(merged.stations.some((s) => s.name === '人民广场' && s.routeName === '3路')).toBe(true);
  });

  it('同内容重复合并幂等：不产生重复条目', () => {
    const remote = normalizeRemoteCatalog(validRemote());
    const once = mergeCatalogData(local, remote, buildFleetMap(validRemote()));
    const twice = mergeCatalogData(once, remote, buildFleetMap(validRemote()));
    expect(twice.routes).toHaveLength(once.routes.length);
    expect(twice.stations).toHaveLength(once.stations.length);
    expect(twice.drivers).toHaveLength(once.drivers.length);
    expect(twice.inspectors).toEqual(once.inspectors);
  });
});

describe('运行时远程更新（storage.checkForCatalogUpdate）', () => {
  let storage;

  beforeEach(async () => {
    localStorage.clear();
    storage = await importStorage();
    storage.replaceAllData(emptyData);
  });

  it('应用远程更新：新增/覆盖合入，本地独有保留，检查记录不受影响', async () => {
    storage.createRecord({ route: '1路', driver: '张三', item01: 'pass' });
    storage.addBasicString('plate', '沪A1');
    const recordsBefore = storage.getRecords();

    mockFetch(validRemote());
    const result = await storage.checkForCatalogUpdate();

    expect(result.hash).toBe(hashCatalogData(validRemote()));
    const b = storage.getBasicData();
    expect(b.routes.some((r) => r.name === '新线')).toBe(true);
    expect(b.routes.find((r) => r.name === '新线').fleet).toBe('新车队');
    expect(b.stations.some((s) => s.name === '新站' && s.routeName === '新线')).toBe(true);
    expect(b.inspectors).toContain('远程检查人');
    expect(b.fleets).toContain('新车队');
    expect(b.drivers.some((d) => d.name === '新司机')).toBe(true);
    expect(b.plates).toContain('沪A1');
    expect(storage.getRecords()).toEqual(recordsBefore);
    expect(storage.getStationRecords()).toEqual([]);
  });

  it('同哈希不重复应用（幂等）', async () => {
    mockFetch(validRemote());
    await storage.checkForCatalogUpdate();
    const afterFirst = storage.getBasicData();

    mockFetch(validRemote());
    const result = await storage.checkForCatalogUpdate();
    expect(result).toBeNull();
    expect(storage.getBasicData()).toEqual(afterFirst);
  });

  it('离线/网络失败静默跳过，本地数据不变', async () => {
    const before = storage.getBasicData();
    mockFetch(null, { fail: true });
    const result = await storage.checkForCatalogUpdate();
    expect(result).toBeNull();
    expect(storage.getBasicData()).toEqual(before);
  });

  it('远程 JSON 非法/缺字段时忽略，不污染本地数据', async () => {
    const before = storage.getBasicData();
    mockFetch({ stations: [], routes: [], checkers: [] });
    const result = await storage.checkForCatalogUpdate();
    expect(result).toBeNull();
    expect(storage.getBasicData()).toEqual(before);
  });

  it('响应非 200 时跳过', async () => {
    const before = storage.getBasicData();
    mockFetch(validRemote(), { ok: false });
    const result = await storage.checkForCatalogUpdate();
    expect(result).toBeNull();
    expect(storage.getBasicData()).toEqual(before);
  });

  it('应用更新后派发非阻断提示（含日期）', async () => {
    const handler = vi.fn();
    window.addEventListener('app:toast', handler);
    mockFetch(validRemote());
    await storage.checkForCatalogUpdate();
    window.removeEventListener('app:toast', handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.message).toContain('基础数据已更新（2026-08-30）');
  });
});
