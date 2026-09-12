// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { replaceAllData } from '../src/lib/storage';
import { fieldInput } from './fieldQuery';

const emptyData = {
  records: [],
  stationRecords: [],
  basicData: { routes: [], stations: [], plates: [], inspectors: [], drivers: [], conductors: [], fleets: [] },
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/';
  replaceAllData(emptyData);
});

function seedData() {
  replaceAllData({
    records: [],
    stationRecords: [],
    basicData: {
      routes: [{ id: 'rt1', name: '莲金专线' }],
      stations: [
        { id: 's1', name: '总站', routeName: '莲金专线', sortOrder: 0 },
        { id: 's2', name: '终点站', routeName: '莲金专线', sortOrder: 1 },
        { id: 's3', name: '其他站', routeName: '莲卫专线', sortOrder: 0 },
      ],
      plates: [],
      inspectors: [],
      drivers: [
        { id: 'd1', name: '张三', routeName: '莲金专线' },
        { id: 'd2', name: '李四', routeName: '莲卫专线' },
        { id: 'd3', name: '王五', routeName: '' },
      ],
      conductors: [
        { id: 'c1', name: '赵六', routeName: '莲金专线' },
        { id: 'c2', name: '钱七', routeName: '莲卫专线' },
      ],
      fleets: [],
    },
  });
}

// 断言若干文本在页面中按给定先后出现（用于校验弹层渲染顺序）
function renderedInOrder(names) {
  const text = document.body.textContent;
  const positions = names.map((n) => text.indexOf(n));
  if (positions.some((p) => p < 0)) return false;
  return positions.every((p, i) => i === 0 || positions[i - 1] < p);
}

describe('跳车表单选择弹层', () => {
  it('更新后站点弹层按线路站序显示，选定线路后只显示该线路站点', () => {
    replaceAllData({
      records: [],
      stationRecords: [],
      basicData: {
        routes: [
          { id: 'rt1', name: '莲金专线', fleet: '' },
          { id: 'rt2', name: '莲卫专线', fleet: '' },
        ],
        // 本地数组顺序与 sortOrder 不一致（更新后老站留原位、新站追加到末尾）
        stations: [
          { id: 's1', name: '莲金末站', routeName: '莲金专线', sortOrder: 2 },
          { id: 's2', name: '莲卫首站', routeName: '莲卫专线', sortOrder: 0 },
          { id: 's3', name: '莲金首站', routeName: '莲金专线', sortOrder: 0 },
          { id: 's4', name: '莲金新增站', routeName: '莲金专线', sortOrder: 1 },
        ],
        plates: [],
        inspectors: [],
        drivers: [],
        conductors: [],
        fleets: [],
      },
    });
    window.location.hash = '#/new';
    render(<App />);

    // 未选线路：按线路分组（线路顺序 + 线路内站序）
    fireEvent.click(screen.getByLabelText('选择上车站点'));
    expect(renderedInOrder(['莲金首站', '莲金新增站', '莲金末站', '莲卫首站'])).toBe(true);
    fireEvent.click(screen.getByText('清空'));

    // 选定线路：只看该线路，且按站序
    fireEvent.click(screen.getByLabelText('选择线路'));
    fireEvent.click(screen.getByText('全部线路'));
    fireEvent.click(screen.getByText('莲金专线'));
    fireEvent.click(screen.getByLabelText('选择下车站点'));
    expect(renderedInOrder(['莲金首站', '莲金新增站', '莲金末站'])).toBe(true);
  });

  it('未选线路时驾驶员/售票员弹层显示全部人员', () => {
    seedData();
    window.location.hash = '#/new';
    render(<App />);

    fireEvent.click(screen.getByLabelText('选择驾驶员'));
    expect(screen.getByText('选择驾驶员')).toBeTruthy();
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByText('李四')).toBeTruthy();
    expect(screen.getByText('王五')).toBeTruthy();
    fireEvent.click(screen.getByText('清空'));

    fireEvent.click(screen.getByLabelText('选择售票员'));
    expect(screen.getByText('选择售票员')).toBeTruthy();
    expect(screen.getByText('赵六')).toBeTruthy();
    expect(screen.getByText('钱七')).toBeTruthy();
    fireEvent.click(screen.getByText('清空'));
  });

  it('选择线路后驾驶员/售票员只显示该线路已分配人员', () => {
    seedData();
    window.location.hash = '#/new';
    render(<App />);

    fireEvent.click(screen.getByLabelText('选择线路'));
    fireEvent.click(screen.getByText('全部线路'));
    fireEvent.click(screen.getByText('莲金专线'));
    expect(fieldInput('线路').value).toBe('莲金专线');

    fireEvent.click(screen.getByLabelText('选择驾驶员'));
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.queryByText('李四')).toBeNull();
    expect(screen.queryByText('王五')).toBeNull();
    fireEvent.click(screen.getByText('清空'));

    fireEvent.click(screen.getByLabelText('选择售票员'));
    expect(screen.getByText('赵六')).toBeTruthy();
    expect(screen.queryByText('钱七')).toBeNull();
    fireEvent.click(screen.getByText('清空'));
  });

  it('未选线路即可打开各选择弹层，不再拦截', () => {
    seedData();
    window.location.hash = '#/new';
    render(<App />);

    fireEvent.click(screen.getByLabelText('选择售票员'));
    expect(screen.queryByText('请先选择线路')).toBeNull();
    expect(screen.getByText('选择售票员')).toBeTruthy();
    fireEvent.click(screen.getByText('清空'));

    fireEvent.click(screen.getByLabelText('选择上车站点'));
    expect(screen.getByText('选择站点')).toBeTruthy();
    expect(screen.getByText('总站')).toBeTruthy();
    expect(screen.getByText('其他站')).toBeTruthy();
    fireEvent.click(screen.getByText('清空'));
  });

  it('站点弹层按所选线路过滤，未选线路显示全部', () => {
    seedData();
    window.location.hash = '#/new';
    render(<App />);

    fireEvent.click(screen.getByLabelText('选择上车站点'));
    expect(screen.getByText('总站')).toBeTruthy();
    expect(screen.getByText('终点站')).toBeTruthy();
    expect(screen.getByText('其他站')).toBeTruthy();
    fireEvent.click(screen.getByText('清空'));

    fireEvent.click(screen.getByLabelText('选择线路'));
    fireEvent.click(screen.getByText('全部线路'));
    fireEvent.click(screen.getByText('莲金专线'));

    fireEvent.click(screen.getByLabelText('选择下车站点'));
    expect(screen.getByText('总站')).toBeTruthy();
    expect(screen.getByText('终点站')).toBeTruthy();
    expect(screen.queryByText('其他站')).toBeNull();
    fireEvent.click(screen.getByText('清空'));
  });

  it('五个可选字段均可手动输入并原样提交', () => {
    window.location.hash = '#/new';
    render(<App />);

    fireEvent.change(fieldInput('线路'), { target: { value: '临时线路' } });
    fireEvent.change(fieldInput('驾驶员'), { target: { value: '临时司机' } });
    fireEvent.change(fieldInput('售票员'), { target: { value: '临时售票' } });
    fireEvent.change(fieldInput('上车地点'), { target: { value: '总站' } });
    fireEvent.change(fieldInput('下车地点'), { target: { value: '终点站' } });
    fireEvent.change(fieldInput('车牌/自编号'), { target: { value: '沪A00000D' } });
    fireEvent.change(fieldInput('检查人'), { target: { value: '王五' } });

    fireEvent.click(screen.getByText('提交检查记录'));

    const stored = JSON.parse(localStorage.getItem('busCheck.records'));
    expect(stored).toHaveLength(1);
    expect(stored[0].route).toBe('临时线路');
    expect(stored[0].driver).toBe('临时司机');
    expect(stored[0].conductor).toBe('临时售票');
    expect(stored[0].boardLocation).toBe('总站');
    expect(stored[0].alightLocation).toBe('终点站');
  });

  it('编辑记录时保留不属于当前线路的人员姓名', () => {
    replaceAllData({
      records: [
        {
          id: 'r1',
          route: '1路',
          plateNumber: '沪A00000D',
          driver: '旧司机',
          conductor: '',
          boardTime: '08:00',
          boardLocation: '总站',
          alightTime: '08:30',
          alightLocation: '终点站',
          inspector: '王五',
          inspectionDate: '2026-08-30',
        },
      ],
      stationRecords: [],
      basicData: {
        routes: [{ id: 'rt1', name: '1路' }],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [{ id: 'd1', name: '新司机', routeName: '1路' }],
        conductors: [],
        fleets: [],
      },
    });
    window.location.hash = '#/edit/r1';
    render(<App />);
    expect(fieldInput('驾驶员').value).toBe('旧司机');
  });
});
