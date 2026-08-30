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

describe('应用冒烟测试', () => {
  it('渲染外壳与五个导航入口', () => {
    render(<App />);
    expect(screen.getByText('公交检查助手')).toBeTruthy();
    expect(screen.getByText('首页')).toBeTruthy();
    expect(screen.getAllByText('驻站检查').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('跳车检查').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('统计')).toBeTruthy();
    expect(screen.getByText('基础数据')).toBeTruthy();
  });

  it('首页双入口：驻站检查与跳车检查入口可点击进入', () => {
    render(<App />);
    fireEvent.click(screen.getByText('进入驻站检查'));
    expect(screen.getByText('登记记录')).toBeTruthy();
    expect(screen.getByText('本次检查信息')).toBeTruthy();
  });

  it('跳车台账页空状态与去新建入口', () => {
    window.location.hash = '#/jump';
    render(<App />);
    expect(screen.getByText('检查台账')).toBeTruthy();
    expect(screen.getByText('暂无检查记录')).toBeTruthy();
    expect(screen.getByText('去新建')).toBeTruthy();
  });

  it('能进入新建表单页', () => {
    window.location.hash = '#/jump';
    render(<App />);
    fireEvent.click(screen.getByLabelText('新建检查'));
    expect(screen.getByText('新建检查记录')).toBeTruthy();
    expect(screen.getByText('基本信息')).toBeTruthy();
    expect(screen.getByText('检查项目')).toBeTruthy();
    expect(screen.getByText('其他信息')).toBeTruthy();
  });

  it('统计页渲染三张卡片与图表标题', () => {
    const now = new Date().toISOString();
    replaceAllData({
      records: [
        {
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
          item02: 'fail',
          remark: '',
          inspector: '王五',
          inspectionDate: '2026-08-30',
          createdAt: now,
          updatedAt: now,
        },
      ],
      basicData: { routes: [], drivers: [], conductors: [], stations: [] },
    });
    window.location.hash = '#/statistics';
    render(<App />);
    expect(screen.getByText('检查车次总数')).toBeTruthy();
    expect(screen.getByText('整体合格率')).toBeTruthy();
    expect(screen.getByText('整体不合格率')).toBeTruthy();
    expect(screen.getByText('项目合格率')).toBeTruthy();
    expect(screen.getByText('不合格项 Top 排行')).toBeTruthy();
  });

  it('导出页渲染配置卡片', () => {
    window.location.hash = '#/export';
    render(<App />);
    expect(screen.getByText('数据导出')).toBeTruthy();
    expect(screen.getByText('导出配置')).toBeTruthy();
    expect(screen.getByText('Excel (.xlsx)')).toBeTruthy();
  });

  it('基础数据页渲染全部页签', () => {
    window.location.hash = '#/basic-data';
    render(<App />);
    expect(screen.getByText('线路')).toBeTruthy();
    expect(screen.getByText('站点')).toBeTruthy();
    expect(screen.getByText('车号')).toBeTruthy();
    expect(screen.getByText('检查人')).toBeTruthy();
    expect(screen.getByText('驾驶员')).toBeTruthy();
    expect(screen.getByText('售票员')).toBeTruthy();
    expect(screen.getByText('车队')).toBeTruthy();
    expect(screen.getByText('Excel 导入')).toBeTruthy();
    expect(screen.getByText('备份/恢复')).toBeTruthy();
    expect(screen.getByText('新增线路')).toBeTruthy();
  });

  it('驻站登记页渲染登记表单', () => {
    window.location.hash = '#/station/reg';
    render(<App />);
    expect(screen.getByText('登记新记录')).toBeTruthy();
    expect(screen.getByText('驻站站名 *')).toBeTruthy();
    expect(screen.getByText('车辆登记信息')).toBeTruthy();
  });

  it('详情页对不存在的记录显示空态', () => {
    window.location.hash = '#/detail/nonexistent';
    render(<App />);
    expect(screen.getByText('记录不存在')).toBeTruthy();
  });

  it('选择页渲染线路选择标题', () => {
    window.location.hash = '#/pick/route';
    render(<App />);
    expect(screen.getByText('选择线路')).toBeTruthy();
  });

  it('台账列表渲染已有记录', () => {
    const now = new Date().toISOString();
    replaceAllData({
      records: [
        {
          id: 'r1',
          route: '1路',
          plateNumber: '粤B12345',
          driver: '张三',
          conductor: '李四',
          boardTime: '08:00',
          boardLocation: '总站',
          alightTime: '08:30',
          alightLocation: '终点站',
          item01: 'pass',
          item02: 'fail',
          remark: '测试',
          inspector: '王五',
          inspectionDate: '2026-08-30',
          createdAt: now,
          updatedAt: now,
        },
      ],
      basicData: { routes: [{ id: 'rt1', name: '1路' }], drivers: [], conductors: [], stations: [] },
    });
    window.location.hash = '#/jump';
    render(<App />);
    expect(screen.getAllByText('粤B12345').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1 项不合格').length).toBeGreaterThanOrEqual(1);
  });

  it('新建检查记录全链路：选线路→填信息→勾选→提交→出现在台账', () => {
    replaceAllData({
      records: [],
      basicData: {
        routes: [{ id: 'rt1', name: '1路' }],
        drivers: [{ id: 'd1', name: '张三', routeName: '1路' }],
        conductors: [],
        stations: [
          { id: 's1', name: '总站', routeName: '1路', sortOrder: 0 },
          { id: 's2', name: '终点站', routeName: '1路', sortOrder: 1 },
        ],
      },
    });
    // 模拟从选择页返回：表单通过 sessionStorage 恢复已选的线路（jsdom 不支持 history.go(-1)）
    sessionStorage.setItem('pickResult', JSON.stringify({ field: 'route', value: '1路' }));
    window.location.hash = '#/new';
    render(<App />);
    expect(screen.getByPlaceholderText('如：1路、20路').value).toBe('1路');

    fireEvent.change(screen.getByPlaceholderText('车牌号或自编号'), { target: { value: '粤B12345' } });
    fireEvent.change(screen.getByPlaceholderText('检查人姓名'), { target: { value: '王五' } });
    fireEvent.click(screen.getByLabelText('按规范佩戴安全带合格'));
    fireEvent.click(screen.getByLabelText('开启转向灯不合格'));

    fireEvent.click(screen.getByText('提交检查记录'));

    expect(screen.getByText('检查台账')).toBeTruthy();
    expect(screen.getAllByText('粤B12345').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1 项不合格').length).toBeGreaterThanOrEqual(1);
    const stored = JSON.parse(localStorage.getItem('busCheck.records'));
    expect(stored).toHaveLength(1);
    expect(stored[0].route).toBe('1路');
    expect(stored[0].item01).toBe('pass');
    expect(stored[0].item02).toBe('fail');
  });
});
