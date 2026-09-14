// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { replaceAllData } from '../src/lib/storage';
import { getLiveConfig, setLiveConfig } from '../src/lib/live/config';
import { resetLineMapCache } from '../src/lib/live/lineMap';

const emptyData = {
  records: [],
  stationRecords: [],
  basicData: {
    routes: [{ id: 'r1', name: '莲张专线', fleet: '' }],
    stations: [],
    plates: [],
    inspectors: [],
    drivers: [],
    conductors: [],
    fleets: [],
  },
};

function renderBasicData() {
  window.location.hash = '#/basic-data';
  return render(<App />);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  resetLineMapCache();
  replaceAllData(emptyData);
  setLiveConfig({ proxyBaseUrl: '', enabled: true, refreshSeconds: 30 });
});

describe('实时数据源设置', () => {
  it('基础数据页有「实时数据源」页签，可填写并保存代理地址', async () => {
    renderBasicData();

    fireEvent.click(screen.getByText('实时数据源'));
    expect(await screen.findByText('连通性自检')).toBeTruthy();
    expect(screen.getByText('Worker 代理地址')).toBeTruthy();

    const input = screen.getByPlaceholderText(/bus-live-proxy/);
    fireEvent.change(input, { target: { value: 'https://proxy.example.workers.dev/' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(getLiveConfig().proxyBaseUrl).toBe('https://proxy.example.workers.dev');
    });
    expect(JSON.parse(localStorage.getItem('busCheck.liveConfig')).proxyBaseUrl).toBe(
      'https://proxy.example.workers.dev'
    );
  });

  it('非法代理地址被拒绝且不写入配置', async () => {
    renderBasicData();
    fireEvent.click(screen.getByText('实时数据源'));

    const input = await screen.findByPlaceholderText(/bus-live-proxy/);
    fireEvent.change(input, { target: { value: 'proxy.example.workers.dev' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(getLiveConfig().proxyBaseUrl).toBe('');
    });
  });

  it('可以关闭实时到站开关', async () => {
    renderBasicData();
    fireEvent.click(screen.getByText('实时数据源'));

    const toggle = await screen.findByRole('checkbox');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(getLiveConfig().enabled).toBe(false);
    });
  });
});
