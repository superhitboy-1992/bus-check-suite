// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { getBasicData, replaceAllData } from '../src/lib/storage';

const fixture = {
  records: [],
  stationRecords: [],
  basicData: {
    routes: [
      { id: 'rt1', name: '1路', fleet: '' },
      { id: 'rt2', name: '2路', fleet: '' },
    ],
    stations: [
      { id: 's1', name: '西站', routeName: '1路', sortOrder: 0 },
      { id: 's2', name: '总站', routeName: '2路', sortOrder: 0 },
      { id: 's3', name: '东站', routeName: '2路', sortOrder: 1 },
    ],
    plates: [],
    inspectors: [],
    drivers: [],
    conductors: [],
    fleets: [],
  },
};

beforeAll(() => {
  globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => 'blob:mock');
  globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {});
});

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/';
  replaceAllData(fixture);
});

function openStationTab() {
  window.location.hash = '#/basic-data';
  render(<App />);
  fireEvent.click(screen.getByText('站点'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1路' } });
  fireEvent.click(screen.getByLabelText('编辑'));
}

describe('基础数据站点归属编辑', () => {
  it('编辑站点可修改所属线路，并排到目标线路末尾', () => {
    openStationTab();
    // 弹窗内的线路下拉在页面下拉之后渲染，取最后一个 select
    const modalSelect = screen.getAllByRole('combobox').at(-1);
    fireEvent.change(modalSelect, { target: { value: '2路' } });
    fireEvent.click(screen.getByText('确定'));

    const s1 = getBasicData().stations.find((s) => s.id === 's1');
    expect(s1.routeName).toBe('2路');
    expect(s1.sortOrder).toBe(2); // 2路现有 2 条，追加到末尾
  });

  it('移动到已有同名站点的线路时提示并阻止', () => {
    replaceAllData({
      ...fixture,
      basicData: {
        ...fixture.basicData,
        stations: [
          { id: 's1', name: '总站', routeName: '1路', sortOrder: 0 },
          { id: 's2', name: '总站', routeName: '2路', sortOrder: 0 },
        ],
      },
    });
    openStationTab();
    const modalSelect = screen.getAllByRole('combobox').at(-1);
    fireEvent.change(modalSelect, { target: { value: '2路' } });
    fireEvent.click(screen.getByText('确定'));

    expect(screen.getByText('该线路已存在同名站点')).toBeTruthy();
    expect(getBasicData().stations.find((s) => s.id === 's1').routeName).toBe('1路');
  });
});
