import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
