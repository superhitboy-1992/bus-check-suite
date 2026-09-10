import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFleetMap, mergeCatalogData, normalizeRemoteCatalog } from '../src/lib/remoteCatalog';
import { stationNameOptions } from '../src/lib/stationOrder';
import { search } from '../src/lib/search';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'public', 'basic-data.json'), 'utf8'));

const LIANTING = [
  '金山铁路亭林站',
  '大亭公路亭虹路(瑞金医院)',
  '车亭公路亭枫公路',
  '车亭公路红阳',
  '车亭公路红亭路',
  '车亭公路施家埭',
  '车亭公路同建公路',
  '车亭公路叶权路',
  '车亭公路叶新公路(叶榭)',
  '车亭公路中原公路',
  '车亭公路旺盛路',
  '车亭公路泖亭路',
  '车亭公路影佳路',
  '新车公路北松公路(车墩)',
  '新车公路南姚路',
  '新车公路车泾路',
  '新车公路南乐路',
  '新车公路三浜路',
  '新车公路新加路',
  '新车公路书林路',
  '新车公路民益路',
  '莲花路地铁站(北广场)',
  '莲花路地铁站(南方商城)',
];

describe('站名格式与远程指令数据快照', () => {
  it('全角括号已全部统一为半角且无 站名|线路 重复', () => {
    expect(data.stations.filter((s) => /[（）]/.test(s.name))).toHaveLength(0);
    const keys = new Set(data.stations.map((s) => `${s.name}|${s.routeName}`));
    expect(keys.size).toBe(data.stations.length);
  });

  it('莲亭专线为 23 站新站表、旧 8 站写入停用指令', () => {
    const route = data.stations
      .filter((s) => s.routeName === '莲亭专线')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.name);
    expect(route).toEqual(LIANTING);
    expect(data.stationRemovals.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        '车亭公路同建村十四号桥',
        '车亭公路立达职业技术学院',
        '车亭公路叶榭车站',
        '车亭公路浦南农副批发市场',
        '松浦大桥',
        '车亭公路北松公路车墩站',
        '新车公路车墩小学',
        '新车公路松江出口加工区',
      ])
    );
  });

  it('莲朱专线按站牌图录入 2 站直达：朱泾汽车站 → 莲花路地铁站(北广场)', () => {
    const route = data.stations
      .filter((s) => s.routeName === '莲朱专线')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.name);
    expect(route).toEqual(['朱泾汽车站', '莲花路地铁站(北广场)']);
  });

  it('莲朱专线B线为双向站牌合并后的 7 站（去程 6 站 + 回程独有亭枫公路贸易路）', () => {
    const route = data.stations
      .filter((s) => s.routeName === '莲朱专线B线')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.name);
    expect(route).toEqual([
      '朱泾汽车站',
      '亭枫公路朱泾工业区',
      '亭枫公路杨家村',
      '亭枫公路新农',
      '亭枫公路贸易路',
      '鸿尊路东日路',
      '莲花路地铁站(北广场)',
    ]);
  });

  it('每条全角括号旧写法都有对应 stationRenames 指令', () => {
    expect(data.stationRenames.length).toBe(184);
    const renames = new Map(
      data.stationRenames.map((r) => [`${r.routeName}|${r.oldName}`, r.newName])
    );
    data.stationRenames.forEach((r) => {
      expect(renames.get(`${r.routeName}|${r.oldName}`)).toBe(r.newName);
      expect(r.oldName).toMatch(/[（）]/);
      expect(r.newName).not.toMatch(/[（）]/);
    });
  });
});

describe('线上更新后的站点选择顺序（真实数据）', () => {
  it('莲朱专线站点选择项按站序显示，可直接用于驻站/跳车登记', () => {
    expect(stationNameOptions(data.stations, data.routes, { routeName: '莲朱专线' })).toEqual([
      '朱泾汽车站',
      '莲花路地铁站(北广场)',
    ]);
  });

  it('莲朱专线B线站点选择项按站序显示', () => {
    expect(stationNameOptions(data.stations, data.routes, { routeName: '莲朱专线B线' })).toEqual([
      '朱泾汽车站',
      '亭枫公路朱泾工业区',
      '亭枫公路杨家村',
      '亭枫公路新农',
      '亭枫公路贸易路',
      '鸿尊路东日路',
      '莲花路地铁站(北广场)',
    ]);
  });

  it('莲亭专线按新站表顺序显示，停用旧站不再出现在选择弹层', () => {
    // 模拟老用户本地：莲亭专线仍是更新前的 8 站（插在数组中间），其余站点保持数组插入顺序
    const oldLianting = data.stationRemovals.map((r, i) => ({
      id: 'old' + i,
      name: r.name,
      routeName: '莲亭专线',
      sortOrder: i,
    }));
    const localStations = data.stations.filter((s) => s.routeName !== '莲亭专线');
    localStations.splice(300, 0, ...oldLianting);
    const local = {
      routes: data.routes.map((r, i) => ({ id: 'rt' + i, name: r.name })),
      stations: localStations,
      plates: [],
      inspectors: [],
      drivers: [],
      conductors: [],
      fleets: data.fleets.map((f) => f.name),
    };

    const merged = mergeCatalogData(local, normalizeRemoteCatalog(data), buildFleetMap(data));
    const names = stationNameOptions(merged.stations, merged.routes, { routeName: '莲亭专线' });

    expect(names).toEqual(LIANTING);
    expect(names).not.toContain(data.stationRemovals[0].name);
    // 弹层浏览（空查询）不再按站名长度重排
    expect(search(names, '', 50).map((m) => m.value)).toEqual(names);
  });
});
