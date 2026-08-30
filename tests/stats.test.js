import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/lib/stats';

function rec(overrides) {
  return {
    id: 'r1',
    route: '1路',
    plateNumber: '粤B12345',
    driver: '张三',
    conductor: '',
    boardTime: '08:00',
    boardLocation: '总站',
    alightTime: '08:30',
    alightLocation: '终点站',
    item01: 'pass',
    item02: 'pass',
    item03: 'fail',
    item04: null,
    item05: 'pass',
    item06: null,
    item07: null,
    item08: null,
    item09: null,
    item10: null,
    item11: null,
    item12: null,
    item13: null,
    item14: null,
    remark: '',
    inspector: '检查员甲',
    inspectionDate: '2026-08-30',
    createdAt: '2026-08-30T01:00:00.000Z',
    updatedAt: '2026-08-30T01:00:00.000Z',
    ...overrides,
  };
}

describe('computeStats', () => {
  it('计算总数、整体合格率与不合格率，待确认不计入分母', () => {
    const stats = computeStats([rec()], { period: 'day', date: '2026-08-30', route: '', inspector: '' });
    expect(stats.totalCount).toBe(1);
    // item01/02/05 pass=3, item03 fail=1，合格率 75
    expect(stats.overallPassRate).toBe(75);
    expect(stats.overallFailRate).toBe(25);
    const item03 = stats.itemStats.find((s) => s.key === 'item03');
    expect(item03.failCount).toBe(1);
    expect(item03.passRate).toBe(0);
    const item01 = stats.itemStats.find((s) => s.key === 'item01');
    expect(item01.passRate).toBe(100);
  });

  it('按日期范围过滤', () => {
    const r1 = rec({ id: 'a', inspectionDate: '2026-08-29' });
    const r2 = rec({ id: 'b', inspectionDate: '2026-08-30' });
    const stats = computeStats([r1, r2], { period: 'day', date: '2026-08-30', route: '', inspector: '' });
    expect(stats.totalCount).toBe(1);
  });

  it('支持线路与检查人筛选', () => {
    const r1 = rec({ id: 'a', route: '1路', inspector: '甲' });
    const r2 = rec({ id: 'b', route: '2路', inspector: '甲' });
    const r3 = rec({ id: 'c', route: '1路', inspector: '乙' });
    const stats = computeStats([r1, r2, r3], { period: 'month', date: '2026-08-01', route: '1路', inspector: '甲' });
    expect(stats.totalCount).toBe(1);
  });

  it('Top 排行只包含不合格项并按次数降序、最多 10 项', () => {
    const r1 = rec({ id: 'a', item03: 'fail', item05: 'fail', item01: 'fail' });
    const stats = computeStats([r1], { period: 'day', date: '2026-08-30', route: '', inspector: '' });
    expect(stats.topFailItems).toEqual([
      { itemName: '按规范佩戴安全带', failCount: 1 },
      { itemName: '多车道未靠右行车', failCount: 1 },
      { itemName: '进出站服务', failCount: 1 },
    ]);
    expect(stats.topFailItems.length).toBeLessThanOrEqual(10);
  });

  it('无记录时所有指标为 0', () => {
    const stats = computeStats([], { period: 'day', date: '2026-08-30', route: '', inspector: '' });
    expect(stats.totalCount).toBe(0);
    expect(stats.overallPassRate).toBe(0);
    expect(stats.overallFailRate).toBe(0);
    expect(stats.topFailItems).toEqual([]);
  });
});
