// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import {
  addInspector,
  clearDraft,
  createRecord,
  deleteRecord,
  getDraft,
  getInspectorHistory,
  getRecords,
  getStorageUsageBytes,
  replaceAllData,
  restoreLastDeleted,
  saveDraft,
  useStoragePressure,
} from '../src/lib/storage';

const emptyData = {
  records: [],
  basicData: { routes: [], drivers: [], conductors: [], stations: [] },
};

const recordSeed = {
  route: '1路',
  plateNumber: '粤B12345',
  driver: '张三',
  conductor: '李四',
  boardTime: '08:00',
  boardLocation: '总站',
  alightTime: '08:30',
  alightLocation: '终点站',
  inspector: '王五',
  inspectionDate: '2026-08-30',
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/';
  replaceAllData(emptyData);
});

describe('草稿恢复', () => {
  it('新建表单输入后写入草稿，重新进入自动恢复', async () => {
    window.location.hash = '#/new';
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByPlaceholderText('车牌号或自编号'), { target: { value: '粤B12345' } });
    await waitFor(() => {
      expect(localStorage.getItem('busCheck.draft')).toBeTruthy();
    });
    unmount();

    window.location.hash = '#/new';
    render(<App />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('车牌号或自编号').value).toBe('粤B12345');
    });
    expect(screen.getByText('清空草稿')).toBeTruthy();
  });

  it('清空草稿会清除本地草稿并清空表单', async () => {
    window.location.hash = '#/new';
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByPlaceholderText('车牌号或自编号'), { target: { value: '粤B12345' } });
    await waitFor(() => {
      expect(localStorage.getItem('busCheck.draft')).toBeTruthy();
    });
    unmount();

    window.location.hash = '#/new';
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('清空草稿')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('清空草稿'));
    expect(localStorage.getItem('busCheck.draft')).toBeNull();
    expect(screen.getByPlaceholderText('车牌号或自编号').value).toBe('');
  });

  it('storage 层草稿保存与清除', () => {
    saveDraft({ route: '1路', plateNumber: '粤B12345' });
    expect(getDraft()).toEqual({ route: '1路', plateNumber: '粤B12345' });
    clearDraft();
    expect(getDraft()).toBeNull();
  });
});

describe('撤销删除', () => {
  it('删除记录后点撤销可恢复原记录', () => {
    const rec = createRecord({ ...recordSeed, item01: 'pass' });
    deleteRecord(rec.id);
    expect(getRecords()).toHaveLength(0);
    const restored = restoreLastDeleted();
    expect(restored).not.toBeNull();
    expect(restored.id).toBe(rec.id);
    expect(restored.createdAt).toBe(rec.createdAt);
    expect(getRecords()).toHaveLength(1);
    expect(getRecords()[0].plateNumber).toBe('粤B12345');
  });

  it('台账页删除弹确认后出现撤销按钮，点击后记录恢复', () => {
    createRecord(recordSeed);
    window.location.hash = '#/jump';
    render(<App />);
    const deleteButtons = screen.getAllByLabelText('删除');
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByText('确认'));
    expect(screen.getByText('删除成功')).toBeTruthy();
    fireEvent.click(screen.getByText('撤销'));
    expect(screen.getAllByText('粤B12345').length).toBeGreaterThanOrEqual(1);
  });
});

describe('选择列表搜索', () => {
  it('按关键字过滤线路，无匹配时显示空态', () => {
    replaceAllData({
      records: [],
      basicData: {
        routes: [
          { id: 'rt1', name: '1路' },
          { id: 'rt2', name: '12路' },
          { id: 'rt3', name: '20路' },
        ],
        drivers: [],
        conductors: [],
        stations: [],
      },
    });
    window.location.hash = '#/pick/route';
    render(<App />);
    const search = screen.getByPlaceholderText('搜索名称');
    fireEvent.change(search, { target: { value: '2' } });
    expect(screen.getByText('12路')).toBeTruthy();
    expect(screen.getByText('20路')).toBeTruthy();
    expect(screen.queryByText('1路')).toBeNull();

    fireEvent.change(search, { target: { value: 'zz' } });
    expect(screen.getByText('无匹配结果')).toBeTruthy();
  });
});

describe('检查人历史', () => {
  it('去重且最近优先，并限制上限', () => {
    addInspector('张三');
    addInspector('李四');
    addInspector('张三');
    expect(getInspectorHistory()).toEqual(['张三', '李四']);
    addInspector('');
    expect(getInspectorHistory()).toHaveLength(2);
  });
});

describe('存储容量预警', () => {
  it('用量估算返回字节数结构', () => {
    const usage = getStorageUsageBytes();
    expect(usage).toHaveProperty('total');
    expect(usage.total).toBeGreaterThanOrEqual(0);
  });

  it('超过阈值时 overLimit 为 true', () => {
    replaceAllData({
      records: [{ id: 'big', big: 'x'.repeat(4 * 1024 * 1024 + 1024) }],
      basicData: { routes: [], drivers: [], conductors: [], stations: [] },
    });
    const { result } = renderHook(() => useStoragePressure());
    expect(result.current.overLimit).toBe(true);
  });

  it('写入触发配额错误时 quotaFailed 为 true', () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'busCheck.records') {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      originalSetItem.call(this, key, value);
    };
    try {
      const { result } = renderHook(() => useStoragePressure());
      expect(result.current.quotaFailed).toBe(false);
      act(() => {
        createRecord(recordSeed);
      });
      expect(result.current.quotaFailed).toBe(true);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
