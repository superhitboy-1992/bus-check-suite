// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { replaceAllData } from '../src/lib/storage';

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

describe('跳车表单选择弹层', () => {
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
    expect(screen.getByPlaceholderText('如：1路、20路').value).toBe('莲金专线');

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

    fireEvent.change(screen.getByPlaceholderText('如：1路、20路'), { target: { value: '临时线路' } });
    fireEvent.change(screen.getByPlaceholderText('驾驶员姓名'), { target: { value: '临时司机' } });
    fireEvent.change(screen.getByPlaceholderText('售票员姓名（可选）'), { target: { value: '临时售票' } });
    const locations = screen.getAllByPlaceholderText('站点名称');
    fireEvent.change(locations[0], { target: { value: '总站' } });
    fireEvent.change(locations[1], { target: { value: '终点站' } });
    fireEvent.change(screen.getByPlaceholderText('车牌号或自编号'), { target: { value: '沪A00000D' } });
    fireEvent.change(screen.getByPlaceholderText('检查人姓名'), { target: { value: '王五' } });

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
    expect(screen.getByPlaceholderText('驾驶员姓名').value).toBe('旧司机');
  });
});
