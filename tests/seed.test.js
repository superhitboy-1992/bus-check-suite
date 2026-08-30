// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CatalogSeed } from '../src/data/catalogSeed';

async function importStorage() {
  vi.resetModules();
  return await import('../src/lib/storage');
}

describe('首启内置驾驶员/售票员名单', () => {
  it('全新存储时按种子填充驾驶员/售票员（仅姓名）', async () => {
    localStorage.clear();
    const storage = await importStorage();
    const basicData = storage.getBasicData();

    expect(CatalogSeed.drivers.length).toBeGreaterThan(0);
    expect(CatalogSeed.conductors.length).toBeGreaterThan(0);
    expect(basicData.drivers).toHaveLength(CatalogSeed.drivers.length);
    expect(basicData.conductors).toHaveLength(CatalogSeed.conductors.length);
    expect(basicData.drivers.map((d) => d.name)).toContain(CatalogSeed.drivers[0].name);
    expect(basicData.conductors.map((c) => c.name)).toContain(CatalogSeed.conductors[0].name);
    expect(basicData.drivers.every((d) => d.name && d.routeName === '')).toBe(true);
    expect(basicData.conductors.every((c) => c.name && c.routeName === '')).toBe(true);
  });

  it('重复初始化不产生重复', async () => {
    localStorage.clear();
    const first = await importStorage();
    const firstCount = first.getBasicData().drivers.length;

    // 不清空存储再次加载：种子标记已写入，跳过重复填充
    const second = await importStorage();
    expect(second.getBasicData().drivers).toHaveLength(firstCount);
    expect(second.getBasicData().conductors).toHaveLength(CatalogSeed.conductors.length);
  });

  it('已有同名/自定义人员时保留用户数据、不覆盖', async () => {
    const seedDriver = CatalogSeed.drivers[0].name;
    const seedConductor = CatalogSeed.conductors[0].name;
    localStorage.clear();
    localStorage.setItem(
      'busCheck.basicData',
      JSON.stringify({
        routes: [],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [
          { id: 'd-custom', name: seedDriver, routeName: '自定义线路' },
          { id: 'd-extra', name: '仅本机添加', routeName: '' },
        ],
        conductors: [{ id: 'c-custom', name: seedConductor, routeName: '自定义线路' }],
        fleets: [],
      })
    );

    const storage = await importStorage();
    const basicData = storage.getBasicData();
    expect(basicData.drivers).toHaveLength(CatalogSeed.drivers.length + 1);
    expect(basicData.conductors).toHaveLength(CatalogSeed.conductors.length);
    expect(basicData.drivers.find((d) => d.name === seedDriver).routeName).toBe('自定义线路');
    expect(basicData.drivers.map((d) => d.name)).toContain('仅本机添加');
    expect(basicData.conductors.find((c) => c.name === seedConductor).routeName).toBe('自定义线路');
  });
});
