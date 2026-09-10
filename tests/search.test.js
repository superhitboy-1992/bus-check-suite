import { describe, expect, it } from 'vitest';
import { search } from '../src/lib/search';

const stations = ['金山铁路亭林站', '车亭公路红阳', '车亭公路亭枫公路', '莲花路地铁站(北广场)'];

describe('模糊搜索', () => {
  it('空查询保持传入顺序（浏览列表用，不再按名称长度重排）', () => {
    expect(search(stations, '', 50).map((m) => m.value)).toEqual(stations);
    expect(search(stations, '   ', 50).map((m) => m.value)).toEqual(stations);
  });

  it('有查询时前缀优先于子串，长度只作兜底', () => {
    const result = search(['车亭公路红阳', '大亭公路车亭村', '车亭公路亭枫公路'], '车亭', 50);
    expect(result.map((m) => m.value)).toEqual(['车亭公路红阳', '车亭公路亭枫公路', '大亭公路车亭村']);
  });

  it('支持拼音首字母与全拼，并保留顺序兜底', () => {
    const byInitial = search(stations, 'ctglhy', 50).map((m) => m.value);
    expect(byInitial[0]).toBe('车亭公路红阳');
    const byFull = search(stations, 'lianhua', 50).map((m) => m.value);
    expect(byFull[0]).toBe('莲花路地铁站(北广场)');
    const tie = search(['乙站', '甲站'], '', 50).map((m) => m.value);
    expect(tie).toEqual(['乙站', '甲站']);
  });

  it('max 截断仍按结果顺序', () => {
    expect(search(stations, '', 2).map((m) => m.value)).toEqual(stations.slice(0, 2));
  });
});
