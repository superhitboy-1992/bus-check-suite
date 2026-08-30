import { describe, expect, it } from 'vitest';
import { failCount, matchRecord, sortDaily, sortExport, sortList } from '../src/lib/filter';

function rec(overrides = {}) {
  return {
    id: 'r1',
    route: '1路',
    plateNumber: '粤B12345',
    driver: '张三',
    inspectionDate: '2026-08-30',
    createdAt: '2026-08-30T01:00:00.000Z',
    item01: 'pass',
    item02: 'fail',
    item03: null,
    ...overrides,
  };
}

describe('filter', () => {
  it('failCount 统计不合格项数', () => {
    expect(failCount(rec())).toBe(1);
    expect(failCount(rec({ item01: 'fail', item02: 'fail' }))).toBe(2);
  });

  it('matchRecord 支持各筛选条件', () => {
    const r = rec();
    expect(matchRecord(r, {})).toBe(true);
    expect(matchRecord(r, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })).toBe(true);
    expect(matchRecord(r, { dateFrom: '2026-09-01' })).toBe(false);
    expect(matchRecord(r, { route: '1' })).toBe(true);
    expect(matchRecord(r, { route: '2' })).toBe(false);
    expect(matchRecord(r, { plateNumber: '粤B' })).toBe(true);
    expect(matchRecord(r, { inspector: '甲' })).toBe(false);
    expect(matchRecord(r, { inspector: '甲' })).toBe(false);
  });

  it('列表按日期倒序，当日按创建时间升序，导出按日期升序', () => {
    const a = rec({ id: 'a', inspectionDate: '2026-08-29', createdAt: '2026-08-29T01:00:00.000Z' });
    const b = rec({ id: 'b', inspectionDate: '2026-08-30', createdAt: '2026-08-30T01:00:00.000Z' });
    const c = rec({ id: 'c', inspectionDate: '2026-08-30', createdAt: '2026-08-30T05:00:00.000Z' });
    expect(sortList([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(sortDaily([c, a, b]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortExport([c, a, b]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
