// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CatalogSeed } from '../src/data/catalogSeed';

async function importStorage() {
  vi.resetModules();
  return await import('../src/lib/storage');
}

describe('首启内置驾驶员/售票员名单', () => {
  it('全新存储时按种子填充驾驶员/售票员（含线路归属）', async () => {
    localStorage.clear();
    const storage = await importStorage();
    const basicData = storage.getBasicData();

    expect(CatalogSeed.drivers.length).toBeGreaterThan(0);
    expect(CatalogSeed.conductors.length).toBeGreaterThan(0);
    expect(basicData.drivers).toHaveLength(CatalogSeed.drivers.length);
    expect(basicData.conductors).toHaveLength(CatalogSeed.conductors.length);
    expect(basicData.drivers.map((d) => d.name)).toContain(CatalogSeed.drivers[0].name);
    expect(basicData.conductors.map((c) => c.name)).toContain(CatalogSeed.conductors[0].name);
    expect(basicData.drivers.every((d) => d.name)).toBe(true);
    expect(basicData.drivers.some((d) => d.routeName)).toBe(true);
    expect(basicData.conductors.every((c) => c.name)).toBe(true);
    expect(basicData.conductors.some((c) => c.routeName)).toBe(true);
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

describe('旧数据一次性补线路归属', () => {
  it('已有安装缺 routeName 的司机/售票员按内置名单补齐，不覆盖已维护归属', async () => {
    const seedDriver = CatalogSeed.drivers.find((d) => d.routeName);
    const seedConductor = CatalogSeed.conductors.find((c) => c.routeName);
    localStorage.clear();
    localStorage.setItem('busCheck.seeded.v2', '1');
    localStorage.setItem(
      'busCheck.basicData',
      JSON.stringify({
        routes: [],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [
          { id: 'd1', name: seedDriver.name, routeName: '' },
          { id: 'd2', name: '仅本机添加', routeName: '' },
        ],
        conductors: [
          { id: 'c1', name: seedConductor.name, routeName: '自定义线路' },
          { id: 'c2', name: '仅本机售票', routeName: '' },
        ],
        fleets: [],
      })
    );

    const storage = await importStorage();
    const basicData = storage.getBasicData();
    expect(basicData.drivers.find((d) => d.name === seedDriver.name).routeName).toBe(seedDriver.routeName);
    expect(basicData.drivers.find((d) => d.name === '仅本机添加').routeName).toBe('');
    expect(basicData.conductors.find((c) => c.name === seedConductor.name).routeName).toBe('自定义线路');
    expect(basicData.conductors.find((c) => c.name === '仅本机售票').routeName).toBe('');
  });

  it('迁移只执行一次，后续手动清空线路不会被覆盖', async () => {
    const seedDriver = CatalogSeed.drivers.find((d) => d.routeName);
    localStorage.clear();
    localStorage.setItem('busCheck.seeded.v2', '1');
    localStorage.setItem(
      'busCheck.basicData',
      JSON.stringify({
        routes: [],
        stations: [],
        plates: [],
        inspectors: [],
        drivers: [{ id: 'd1', name: seedDriver.name, routeName: '' }],
        conductors: [],
        fleets: [],
      })
    );

    const first = await importStorage();
    expect(first.getBasicData().drivers[0].routeName).toBe(seedDriver.routeName);
    expect(localStorage.getItem('busCheck.staffRoutes.v1')).toBe('1');

    first.updateBasicItem('driver', first.getBasicData().drivers[0].id, { routeName: '' });
    const second = await importStorage();
    expect(second.getBasicData().drivers[0].routeName).toBe('');
  });
});
