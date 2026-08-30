import { describe, expect, it } from 'vitest';
import { EXPORT_HEADER } from '../src/lib/constants';
import { buildCSVBlob, buildRows, cellValue, exportFilename, toCSV } from '../src/lib/export';

function rec(overrides = {}) {
  return {
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
    item03: null,
    remark: '备注,含逗号',
    inspector: '王五',
    inspectionDate: '2026-08-30',
    ...overrides,
  };
}

describe('export', () => {
  it('表头为 26 列且与要求完全一致', () => {
    expect(EXPORT_HEADER).toEqual([
      '序号',
      '线路',
      '车牌/自编号',
      '驾驶员',
      '售票员',
      '上车时间',
      '上车地点',
      '下车时间',
      '下车地点',
      '按规范佩戴安全带',
      '开启转向灯',
      '平稳起步',
      '平稳靠站',
      '规范进出站',
      '匀速行驶',
      '安全跟车距离',
      '规范变道',
      '正确使用灯光',
      '禁止手持接打手机',
      '禁止与他人闲聊',
      '禁止吸烟饮食',
      '礼貌服务用语',
      '拒载甩站改线',
      '备注',
      '检查人',
      '检查日期',
    ]);
    expect(EXPORT_HEADER).toHaveLength(26);
  });

  it('单元格值：pass→√，fail→×，null→空', () => {
    expect(cellValue('pass')).toBe('√');
    expect(cellValue('fail')).toBe('×');
    expect(cellValue(null)).toBe('');
    expect(cellValue(undefined)).toBe('');
  });

  it('buildRows 生成 26 列并带序号', () => {
    const rows = buildRows([rec()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(26);
    expect(rows[0][0]).toBe(1);
    expect(rows[0][1]).toBe('1路');
    expect(rows[0][9]).toBe('√');
    expect(rows[0][10]).toBe('×');
    expect(rows[0][11]).toBe('');
  });

  it('CSV 带 BOM，并对含逗号的单元格加引号转义', () => {
    const csv = toCSV([EXPORT_HEADER, ...buildRows([rec()])]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"备注,含逗号"');
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0].split(',').length).toBe(26);
  });

  it('CSV 对换行和引号转义', () => {
    const csv = toCSV([['a\nb', 'he said "hi"']]);
    expect(csv).toContain('"a\nb"');
    expect(csv).toContain('"he said ""hi"""');
  });

  it('导出文件名使用 M.D 格式与扩展名', () => {
    expect(exportFilename('2026-08-30', 'xlsx')).toBe('营运检查表-跳车及服务检查【8.30】.xlsx');
    expect(exportFilename('2026-08-30', 'csv')).toBe('营运检查表-跳车及服务检查【8.30】.csv');
  });

  it('buildCSVBlob 产出可读文本', async () => {
    const blob = buildCSVBlob([rec()]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = await blob.text();
    expect(text.startsWith('序号')).toBe(true);
  });
});
