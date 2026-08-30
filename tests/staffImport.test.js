// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeStaffRoute, parseFile, parseStaff, readFile } from '../src/lib/stationImport';
import { getBasicData, mergeCatalogItems, replaceAllData } from '../src/lib/storage';

function staffRows() {
  return [
    ['序号', '工号', '姓名', '科室/线路', '岗位'],
    ['1', '001', '陈强', '莲朱专线', '驾驶员'],
    ['2', '002', '何海林', '枫一', '驾驶员'],
    ['3', '003', '李四', '1652路（工业区三路）', '驾驶员'],
    ['4', '004', '王五', '常务司机', '常务司机'],
    ['5', '005', '赵六', '莲金专线', '乘务员'],
    ['6', '006', '钱七', '莲卫专线', '乘务员'],
  ];
}

function staffWorkbookBuffer(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

beforeEach(() => {
  replaceAllData({
    records: [],
    stationRecords: [],
    basicData: {
      routes: [],
      stations: [],
      plates: [],
      inspectors: [],
      drivers: [],
      conductors: [],
      fleets: [],
    },
  });
});

describe('司售名单解析', () => {
  it('parseStaff 按岗位解析驾驶员/售票员并生成线路归属', () => {
    const { drivers, conductors } = parseStaff(staffRows());
    expect(drivers).toEqual([
      { name: '陈强', routeName: '莲朱专线' },
      { name: '何海林', routeName: '枫泾1路' },
      { name: '李四', routeName: '1652路' },
      { name: '王五', routeName: '' },
    ]);
    expect(conductors).toEqual([
      { name: '赵六', routeName: '莲金专线' },
      { name: '钱七', routeName: '莲卫专线' },
    ]);
  });

  it('parseFile 识别司售名单时不再把姓名当驻站人', () => {
    const parsed = parseFile(staffRows());
    expect(parsed.checkers).toEqual([]);
    expect(parsed.stations).toEqual([]);
    expect(parsed.routes).toEqual([]);
    expect(parsed.drivers.length).toBe(4);
    expect(parsed.conductors.length).toBe(2);
  });

  it('parseFile 识别「每列一条线路」布局：站点带线路归属、共线站一站多线、全部列跳过', () => {
    const rows = [
      ['全部', '1路', '2路'],
      ['总站', '总站', '东站'],
      ['西站', '西站', '总站'],
      ['', '南站', '西站'],
    ];
    const parsed = parseFile(rows);
    expect(parsed.routes).toEqual(['1路', '2路']);
    expect(parsed.stations).toEqual([
      { name: '总站', routeName: '1路', sortOrder: 0 },
      { name: '西站', routeName: '1路', sortOrder: 1 },
      { name: '南站', routeName: '1路', sortOrder: 2 },
      { name: '东站', routeName: '2路', sortOrder: 0 },
      { name: '总站', routeName: '2路', sortOrder: 1 },
      { name: '西站', routeName: '2路', sortOrder: 2 },
    ]);
  });

  it('parseFile 无线路列时（单列站点表）站点回退为通用站点', () => {
    const parsed = parseFile([['站点'], ['总站'], ['西站']]);
    expect(parsed.stations).toEqual([
      { name: '总站', routeName: '', sortOrder: 0 },
      { name: '西站', routeName: '', sortOrder: 0 },
    ]);
  });

  it('readFile 能从 xlsx 字节流识别司售名单', () => {
    const parsed = readFile(staffWorkbookBuffer(staffRows()));
    expect(parsed.drivers.find((d) => d.name === '何海林').routeName).toBe('枫泾1路');
    expect(parsed.conductors.map((c) => c.name)).toEqual(['赵六', '钱七']);
  });

  it('normalizeStaffRoute 规范化别名与括号后缀', () => {
    expect(normalizeStaffRoute('枫一', '驾驶员')).toBe('枫泾1路');
    expect(normalizeStaffRoute('枫二', '驾驶员')).toBe('枫泾2路');
    expect(normalizeStaffRoute('枫六', '驾驶员')).toBe('枫泾6路');
    expect(normalizeStaffRoute('朱枫专线', '驾驶员')).toBe('朱枫线');
    expect(normalizeStaffRoute('1652路（工业区三路）', '驾驶员')).toBe('1652路');
    expect(normalizeStaffRoute('常务司机', '常务司机')).toBe('');
    expect(normalizeStaffRoute('', '驾驶员')).toBe('');
  });
});

describe('mergeCatalogItems 合并司售名单', () => {
  it('按姓名补缺并只为空线路人员补充归属，不覆盖手工维护', () => {
    replaceAllData({
      records: [],
      stationRecords: [],
      basicData: {
        routes: [],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [
          { id: 'd1', name: '陈强', routeName: '' },
          { id: 'd2', name: '赵六', routeName: '莲金专线' },
        ],
        conductors: [{ id: 'c1', name: '钱七', routeName: '' }],
        fleets: [],
      },
    });

    const r = mergeCatalogItems({
      drivers: [
        { name: '陈强', routeName: '莲朱专线' },
        { name: '赵六', routeName: '莲卫专线' },
        { name: '新司机', routeName: '莲金专线' },
      ],
      conductors: [
        { name: '钱七', routeName: '莲卫专线' },
        { name: '新售票', routeName: '莲金专线' },
      ],
    });

    expect(r.addedDrivers).toBe(1);
    expect(r.filledDrivers).toBe(1);
    expect(r.addedConductors).toBe(1);
    expect(r.filledConductors).toBe(1);

    const b = getBasicData();
    expect(b.drivers.find((d) => d.name === '陈强').routeName).toBe('莲朱专线');
    expect(b.drivers.find((d) => d.name === '赵六').routeName).toBe('莲金专线');
    expect(b.drivers.find((d) => d.name === '新司机').routeName).toBe('莲金专线');
    expect(b.conductors.find((c) => c.name === '钱七').routeName).toBe('莲卫专线');
    expect(b.conductors.find((c) => c.name === '新售票').routeName).toBe('莲金专线');
  });
});
