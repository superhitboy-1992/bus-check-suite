import { describe, expect, it } from 'vitest';
import { addDays, formatM_D, monthStartStr, periodStartDate, toDateStr, weekStartStr } from '../src/lib/dates';

describe('dates', () => {
  it('toDateStr 输出本地 yyyy-MM-dd', () => {
    expect(toDateStr(new Date(2026, 7, 30))).toBe('2026-08-30');
  });

  it('monthStartStr 返回当月 1 日', () => {
    expect(monthStartStr(new Date(2026, 7, 30))).toBe('2026-08-01');
  });

  it('weekStartStr 返回本周一（2026-08-30 是周日，本周一为 08-24）', () => {
    expect(weekStartStr(new Date(2026, 7, 30))).toBe('2026-08-24');
    expect(weekStartStr(new Date(2026, 7, 24))).toBe('2026-08-24');
  });

  it('periodStartDate 按日/周/月返回起点', () => {
    const d = new Date(2026, 7, 30);
    expect(periodStartDate('day', d)).toBe('2026-08-30');
    expect(periodStartDate('week', d)).toBe('2026-08-24');
    expect(periodStartDate('month', d)).toBe('2026-08-01');
  });

  it('formatM_D 输出 M.D 格式', () => {
    expect(formatM_D('2026-08-30')).toBe('8.30');
    expect(formatM_D('2026-11-05')).toBe('11.5');
  });

  it('addDays 正确处理跨月', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });
});
