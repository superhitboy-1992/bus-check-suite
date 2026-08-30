import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { generate, zip } from '../src/lib/stationXlsx';
import { groupRecords, humanSize, toRecordRows } from '../src/lib/stationCore';

function stationRec(overrides = {}) {
  return {
    id: 'z1',
    station: '汽车站',
    checker: '张三',
    date: '2026-08-16',
    time: '08:30',
    route: '莲朱专线',
    plate: '沪A36401D',
    boarding: '12',
    stationNorms: '√',
    conductorCall: '×',
    checkResult: '正常',
    rectification: '已当场整改',
    remark: '备注',
    ...overrides,
  };
}

describe('驻站模板导出', () => {
  it('生成 xlsx 可被解析，表头与数据单元格正确', () => {
    const group = groupRecords([stationRec()])[0];
    const bin = generate(
      { station: group.station, checker: group.checker, dateLabel: group.dateLabel },
      toRecordRows(group.records)
    );
    expect(bin[0]).toBe(0x50); // P
    expect(bin[1]).toBe(0x4b); // K

    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws['A2'].v).toBe('驻站站名:汽车站');
    expect(ws['E2'].v).toBe('驻站人:张三');
    expect(ws['J2'].v).toBe('8月16日');
    expect(ws['B5'].v).toBe('莲朱专线');
    expect(ws['C5'].v).toBe('沪A36401D');
    expect(ws['D5'].v).toBe('08:30');
    expect(ws['E5'].v).toBe(12);
    expect(ws['F5'].v).toBe('√');
    expect(ws['G5'].v).toBe('×');
    expect(ws['H5'].v).toBe('正常');
    expect(ws['I5'].v).toBe('已当场整改');
    expect(ws['J5'].v).toBe('备注');
  });

  it('超出 30 条只取前 30 行，模板行数固定', () => {
    const records = Array.from({ length: 35 }, (_, i) =>
      stationRec({ id: 'z' + i, time: (i < 10 ? '0' + i : String(i)) + ':00', plate: '沪A' + i })
    );
    const group = groupRecords(records)[0];
    const bin = generate(
      { station: group.station, checker: group.checker, dateLabel: group.dateLabel },
      toRecordRows(group.records)
    );
    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets[Object.keys(wb.Sheets)[0]];
    expect(ws['B34'].v).toBe('莲朱专线');
    expect(ws['J34'].v).toBe('备注');
  });

  it('ZIP 批量导出生成有效 zip 文件头', () => {
    const group = groupRecords([stationRec()])[0];
    const data = generate(
      { station: group.station, checker: group.checker, dateLabel: group.dateLabel },
      toRecordRows(group.records)
    );
    const bin = zip([{ name: '驻站记录表【8.16】.xlsx', data }]);
    expect(bin[0]).toBe(0x50);
    expect(bin[1]).toBe(0x4b);
    expect(bin[2]).toBe(0x03);
    expect(bin[3]).toBe(0x04);
    expect(bin.length).toBeGreaterThan(data.length);
  });
});

describe('humanSize', () => {
  it('按 B / KB / MB 格式化文件大小', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2.0 KB');
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(humanSize('abc')).toBe('0 B');
  });
});
