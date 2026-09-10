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

// 断言若干文本在页面中按给定先后出现（用于校验列表渲染顺序）
function renderedInOrder(names) {
  const text = document.body.textContent;
  const positions = names.map((n) => text.indexOf(n));
  if (positions.some((p) => p < 0)) return false;
  return positions.every((p, i) => i === 0 || positions[i - 1] < p);
}

describe('驻站登记', () => {
  it('基础数据更新后，站点弹层按线路站序显示（不再按本地数组插入顺序）', () => {
    replaceAllData({
      ...emptyData,
      basicData: {
        ...emptyData.basicData,
        routes: [
          { id: 'rt1', name: '1路', fleet: '' },
          { id: 'rt2', name: '2路', fleet: '' },
        ],
        // 模拟更新后的本地数组：老站留在原位、sortOrder 被远程覆盖、新站追加到末尾
        stations: [
          { id: 'a1', name: '老站甲', routeName: '1路', sortOrder: 2 },
          { id: 'b1', name: '二路首站', routeName: '2路', sortOrder: 0 },
          { id: 'a2', name: '老站乙', routeName: '1路', sortOrder: 0 },
          { id: 'a3', name: '更新新增站', routeName: '1路', sortOrder: 1 },
        ],
      },
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '选择站点' }));
    expect(renderedInOrder(['老站乙', '更新新增站', '老站甲', '二路首站'])).toBe(true);
  });

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

  it('站点选择器只显示未停用站点', () => {
    replaceAllData({
      ...emptyData,
      basicData: {
        ...emptyData.basicData,
        stations: [
          { id: 'a1', name: '汽车站(北)', routeName: '1路', sortOrder: 0 },
          { id: 'a2', name: '汽车站（北）', routeName: '1路', sortOrder: 0, retired: true },
          { id: 'a3', name: '停用老站', routeName: '2路', sortOrder: 0, retired: true },
        ],
      },
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '选择站点' }));
    expect(screen.getByText('汽车站(北)')).toBeTruthy();
    expect(screen.queryByText('汽车站（北）')).toBeNull();
    expect(screen.queryByText('停用老站')).toBeNull();
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
