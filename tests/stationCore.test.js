import { describe, expect, it } from 'vitest';
import {
  dateDot,
  dateLabel,
  groupRecords,
  normalizePlate,
  nowTime,
  pad2,
  safeName,
  toNum,
  toRecordRows,
  todayStr,
  validRecord,
} from '../src/lib/stationCore';

function rec(overrides = {}) {
  return {
    id: 'r1',
    station: '汽车站',
    checker: '张三',
    date: '2026-08-16',
    time: '08:30',
    route: '莲朱专线',
    plate: '沪A36401D',
    boarding: '12',
    stationNorms: '√',
    conductorCall: '',
    checkResult: '正常',
    rectification: '',
    remark: '',
    ...overrides,
  };
}

describe('驻站 core 函数', () => {
  it('日期与时间格式化', () => {
    expect(pad2(5)).toBe('05');
    expect(dateLabel('2026-08-16')).toBe('8月16日');
    expect(dateDot('2026-08-16')).toBe('8.16');
    expect(dateLabel('')).toBe('');
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nowTime()).toMatch(/^\d{2}:\d{2}$/);
  });

  it('车号归一化：全角转半角、去空格/横线、字母大写', () => {
    expect(normalizePlate('沪A 36401 D')).toBe('沪A36401D');
    expect(normalizePlate('沪a-36401-d')).toBe('沪A36401D');
    expect(normalizePlate('　沪A．36401·d')).toBe('沪A36401D');
    expect(normalizePlate('')).toBe('');
  });

  it('数字与文件名安全化', () => {
    expect(toNum('12')).toBe(12);
    expect(toNum('abc')).toBe(0);
    expect(toNum('')).toBe(0);
    expect(safeName('a/b:c*d?')).toBe('a_b_c_d_');
  });

  it('有效记录校验：站点/驻站人/日期/线路/车号必填', () => {
    expect(validRecord(rec())).toBe(true);
    expect(validRecord(rec({ station: '' }))).toBe(false);
    expect(validRecord(rec({ checker: '' }))).toBe(false);
    expect(validRecord(rec({ route: '' }))).toBe(false);
    expect(validRecord(rec({ plate: '  ' }))).toBe(false);
    expect(validRecord(null)).toBe(false);
  });

  it('按日期+站点分组，组内按时间排序，跨日期倒序', () => {
    const groups = groupRecords([
      rec({ id: 'a', date: '2026-08-16', time: '09:00', station: '汽车站' }),
      rec({ id: 'b', date: '2026-08-16', time: '08:00', station: '汽车站' }),
      rec({ id: 'c', date: '2026-08-17', time: '08:00', station: '汽车站' }),
      rec({ id: 'd', date: '2026-08-17', time: '08:10', station: '火车站' }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].date).toBe('2026-08-17');
    expect(groups[0].station).toBe('汽车站');
    expect(groups[0].count).toBe(1);
    expect(groups[0].dateLabel).toBe('8月17日');
    const stationGroup = groups.find((g) => g.date === '2026-08-16');
    expect(stationGroup.records.map((r) => r.id)).toEqual(['b', 'a']);
    expect(stationGroup.checker).toBe('张三');
  });

  it('toRecordRows 固定输出 30 行，超出部分截断', () => {
    const records = Array.from({ length: 35 }, (_, i) => rec({ id: 'r' + i, time: pad2(i) + ':00' }));
    const rows = toRecordRows(records);
    expect(rows).toHaveLength(30);
    expect(rows[0].route).toBe('莲朱专线');
    expect(rows[0].boarding).toBe(12);
    expect(rows[29]).not.toBeNull();
    const empty = toRecordRows([]);
    expect(empty).toHaveLength(30);
    expect(empty[0]).toBeNull();
  });
});
