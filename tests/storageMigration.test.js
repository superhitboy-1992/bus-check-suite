// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildBackupPayload,
  describeBackup,
  getBasicData,
  getRecords,
  getStationRecords,
  importBackupMerge,
  mergeCatalogItems,
  replaceAllData,
} from '../src/lib/storage';

const emptyData = {
  records: [],
  stationRecords: [],
  basicData: { routes: [], stations: [], plates: [], inspectors: [], drivers: [], conductors: [], fleets: [] },
};

beforeEach(() => {
  localStorage.clear();
  replaceAllData(emptyData);
});

describe('旧备份合并导入', () => {
  it('识别并导入旧版跳车备份（v1）', () => {
    const oldJump = {
      app: '公交跳车检查助手',
      version: 1,
      records: [
        {
          id: 'j1',
          route: '1路',
          plateNumber: '粤B12345',
          driver: '张三',
          inspectionDate: '2026-08-30',
          item01: 'pass',
        },
      ],
      basicData: {
        routes: [{ id: 'rt1', name: '1路' }],
        drivers: [{ id: 'd1', name: '张三', routeName: '1路' }],
        conductors: [],
        stations: [{ id: 's1', name: '总站', routeName: '1路', sortOrder: 0 }],
      },
    };
    expect(describeBackup(oldJump).kind).toBe('jump-v1');
    const r = importBackupMerge(oldJump);
    expect(r.recordsAdded).toBe(1);
    expect(getRecords()).toHaveLength(1);
    expect(getRecords()[0].route).toBe('1路');
    expect(getStationRecords()).toHaveLength(0);
    expect(getBasicData().routes.map((x) => x.name)).toContain('1路');
    expect(getBasicData().drivers.map((x) => x.name)).toContain('张三');
  });

  it('识别并导入旧版驻站备份（v1）：settings 转为统一基础资料', () => {
    const oldStation = {
      app: '驻站检查登记系统',
      version: 1,
      records: [
        {
          id: 'z1',
          station: '汽车站',
          checker: '王五',
          date: '2026-08-16',
          time: '08:30',
          route: '莲朱专线',
          plate: '沪A36401D',
          boarding: '10',
          stationNorms: '√',
        },
      ],
      settings: {
        stations: ['汽车站', '火车站'],
        checkers: ['王五'],
        routes: ['莲朱专线', '莲金专线'],
        plates: ['沪A36401D'],
        fleets: [{ name: '一车队', routes: ['莲朱专线'] }],
      },
    };
    expect(describeBackup(oldStation).kind).toBe('station-v1');
    const r = importBackupMerge(oldStation);
    expect(r.stationRecordsAdded).toBe(1);
    expect(getStationRecords()).toHaveLength(1);
    expect(getStationRecords()[0].route).toBe('莲朱专线');
    expect(getBasicData().stations.map((s) => s.name)).toEqual(expect.arrayContaining(['汽车站', '火车站']));
    expect(getBasicData().stations.every((s) => s.routeName === '')).toBe(true);
    expect(getBasicData().inspectors).toContain('王五');
    expect(getBasicData().plates).toContain('沪A36401D');
    expect(getBasicData().fleets).toContain('一车队');
    expect(getBasicData().routes.find((r2) => r2.name === '莲朱专线').fleet).toBe('一车队');
  });

  it('导入备份时当前已有驾驶员/售票员不报错，按姓名并集合并', () => {
    replaceAllData({
      ...emptyData,
      basicData: {
        ...emptyData.basicData,
        drivers: [{ id: 'd-old', name: '老驾驶员', routeName: '' }],
        conductors: [{ id: 'c-old', name: '老售票员', routeName: '' }],
      },
    });
    const payload = {
      app: '公交跳车检查助手',
      version: 1,
      records: [],
      basicData: {
        routes: [],
        drivers: [{ id: 'd-new', name: '新驾驶员', routeName: '1路' }],
        conductors: [{ id: 'c-new', name: '新售票员', routeName: '' }],
        stations: [],
      },
    };
    expect(() => importBackupMerge(payload)).not.toThrow();
    expect(getBasicData().drivers.map((d) => d.name)).toEqual(expect.arrayContaining(['老驾驶员', '新驾驶员']));
    expect(getBasicData().conductors.map((c) => c.name)).toEqual(expect.arrayContaining(['老售票员', '新售票员']));
  });

  it('v2 备份导出后可完整还原，且重复导入不去重覆盖', () => {
    replaceAllData({
      records: [{ id: 'j1', route: '1路', plateNumber: '粤B12345' }],
      stationRecords: [{ id: 'z1', station: '汽车站', route: '莲朱专线', plate: '沪A36401D', date: '2026-08-16' }],
      basicData: {
        routes: [{ id: 'rt1', name: '1路' }],
        stations: [{ id: 's1', name: '汽车站', routeName: '', sortOrder: 0 }],
        plates: ['沪A36401D'],
        inspectors: ['王五'],
        drivers: [],
        conductors: [],
        fleets: [],
      },
    });
    const payload = buildBackupPayload();
    expect(describeBackup(payload).kind).toBe('v2');
    replaceAllData(emptyData);
    const r = importBackupMerge(payload);
    expect(r.recordsAdded).toBe(1);
    expect(r.stationRecordsAdded).toBe(1);
    expect(getRecords()).toHaveLength(1);
    expect(getStationRecords()).toHaveLength(1);
    expect(getBasicData().routes[0].name).toBe('1路');

    // 重复导入同一备份：按 id 去重，不会新增
    const again = importBackupMerge(payload);
    expect(again.recordsAdded).toBe(0);
    expect(again.stationRecordsAdded).toBe(0);
    expect(getRecords()).toHaveLength(1);
    expect(getStationRecords()).toHaveLength(1);
  });

  it('无效备份抛错', () => {
    expect(() => importBackupMerge(null)).toThrow();
    expect(() => importBackupMerge({ foo: 1 })).toThrow();
    expect(() => describeBackup({ foo: 1 })).toThrow();
  });
});

describe('资料库合并（Excel 导入场景）', () => {
  it('只填充缺失项，已存在的不重复添加', () => {
    replaceAllData({
      records: [],
      basicData: {
        routes: [{ id: 'rt1', name: '1路', fleet: '一车队' }],
        stations: [{ id: 's1', name: '汽车站', routeName: '', sortOrder: 0 }],
        plates: [],
        inspectors: ['王五'],
        drivers: [],
        conductors: [],
        fleets: ['一车队'],
      },
    });
    const r = mergeCatalogItems({
      stations: ['汽车站', '火车站'],
      routes: ['1路', '2路'],
      checkers: ['王五', '赵六'],
    });
    expect(r.addedStations).toBe(1);
    expect(r.addedRoutes).toBe(1);
    expect(r.addedCheckers).toBe(1);
    expect(getBasicData().stations.map((s) => s.name)).toEqual(expect.arrayContaining(['汽车站', '火车站']));
    expect(getBasicData().routes.map((x) => x.name)).toEqual(expect.arrayContaining(['1路', '2路']));
    expect(getBasicData().inspectors).toEqual(expect.arrayContaining(['王五', '赵六']));
    expect(getBasicData().routes.find((x) => x.name === '1路').fleet).toBe('一车队');
  });
});
