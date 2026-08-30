// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { getBasicData, replaceAllData } from '../src/lib/storage';

const emptyData = {
  records: [],
  stationRecords: [],
  basicData: { routes: [], stations: [], plates: [], inspectors: [], drivers: [], conductors: [], fleets: [] },
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/station/reg';
  replaceAllData(emptyData);
});

describe('驻站登记', () => {
  it('填写并保存一条记录：固定信息保留、车辆信息清空、自动学习资料', () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByPlaceholderText('如：汽车站'), { target: { value: '汽车站' } });
    fireEvent.change(screen.getByPlaceholderText('检查人姓名'), { target: { value: '王五' } });
    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-08-30' } });
    fireEvent.change(screen.getByPlaceholderText('如：莲朱专线'), { target: { value: '莲朱专线' } });
    const plateInput = screen.getByPlaceholderText('如：沪A36401D，可留空');
    fireEvent.change(plateInput, { target: { value: '沪A 36401 D' } });
    fireEvent.blur(plateInput);
    fireEvent.click(screen.getByText('保存记录'));

    const stored = JSON.parse(localStorage.getItem('busCheck.stationRecords'));
    expect(stored).toHaveLength(1);
    expect(stored[0].station).toBe('汽车站');
    expect(stored[0].checker).toBe('王五');
    expect(stored[0].date).toBe('2026-08-30');
    expect(stored[0].route).toBe('莲朱专线');
    expect(stored[0].plate).toBe('沪A36401D');
    expect(stored[0].boarding).toBe('0');

    // 固定信息保留，车辆信息清空
    expect(screen.getByPlaceholderText('如：汽车站').value).toBe('汽车站');
    expect(screen.getByPlaceholderText('如：莲朱专线').value).toBe('');
    expect(screen.getByPlaceholderText('如：沪A36401D，可留空').value).toBe('');

    // 自动学习：车号与驻站人进入基础资料
    expect(getBasicData().plates).toContain('沪A36401D');
    expect(getBasicData().inspectors).toContain('王五');
    expect(getBasicData().routes.map((r) => r.name)).toContain('莲朱专线');
  });

  it('√/× 两态按钮：留空 → √ → × → 留空', () => {
    render(<App />);
    const tickButtons = screen.getAllByText('留空');
    fireEvent.click(tickButtons[0]);
    expect(screen.getByText('√ 正常')).toBeTruthy();
    fireEvent.click(screen.getByText('√ 正常'));
    expect(screen.getByText('× 异常')).toBeTruthy();
    fireEvent.click(screen.getByText('× 异常'));
    expect(screen.getAllByText('留空').length).toBeGreaterThanOrEqual(1);
  });

  it('必填校验：缺日期/过站时间/线路时提示', () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('如：汽车站'), { target: { value: '汽车站' } });
    fireEvent.change(screen.getByPlaceholderText('检查人姓名'), { target: { value: '王五' } });
    fireEvent.click(screen.getByText('保存记录'));
    expect(screen.getByText('请填写：站点、驻站人、日期、过站时间、线路')).toBeTruthy();
    expect(localStorage.getItem('busCheck.stationRecords')).toBe('[]');
  });

  it('必填字段齐全但车号留空时可正常保存', () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByPlaceholderText('如：汽车站'), { target: { value: '汽车站' } });
    fireEvent.change(screen.getByPlaceholderText('检查人姓名'), { target: { value: '王五' } });
    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-08-30' } });
    fireEvent.change(screen.getByPlaceholderText('如：莲朱专线'), { target: { value: '莲朱专线' } });
    fireEvent.click(screen.getByText('现在'));
    fireEvent.click(screen.getByText('保存记录'));

    const stored = JSON.parse(localStorage.getItem('busCheck.stationRecords'));
    expect(stored).toHaveLength(1);
    expect(stored[0].plate).toBe('');
    expect(stored[0].route).toBe('莲朱专线');
  });

  it('线路选择弹层支持车队两级浏览', () => {
    replaceAllData({
      records: [],
      stationRecords: [],
      basicData: {
        routes: [
          { id: 'rt1', name: '莲朱专线', fleet: '一车队' },
          { id: 'rt2', name: '金山115路', fleet: '五车队' },
        ],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [],
        conductors: [],
        fleets: ['一车队', '五车队'],
      },
    });
    render(<App />);
    fireEvent.click(screen.getByLabelText('选择线路'));
    expect(screen.getByText('全部线路')).toBeTruthy();
    expect(screen.getByText('一车队')).toBeTruthy();
    fireEvent.click(screen.getByText('一车队'));
    expect(screen.getByText('莲朱专线')).toBeTruthy();
    expect(screen.queryByText('金山115路')).toBeNull();
  });
});
