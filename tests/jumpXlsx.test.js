import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { generate, parseStoredZip } from '../src/lib/jumpXlsx';
import { JumpTemplate } from '../src/lib/jumpTemplate';

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
    remark: '',
    inspector: '王五',
    inspectionDate: '2026-08-25',
    createdAt: '2026-08-25T08:00:00.000Z',
    ...overrides,
  };
}

function tplBytes() {
  return new Uint8Array(Buffer.from(JumpTemplate.base64, 'base64'));
}

function entry(parts, name) {
  const found = parts.find((e) => e.name === name);
  if (!found) throw new Error('缺少条目：' + name);
  return new TextDecoder().decode(found.data);
}

describe('跳车模板导出', () => {
  it('单页数据映射：各列写入正确、序号保持模板预填、页脚填写检查人与日期', () => {
    const bin = generate({ startDate: '2026-08-25', inspector: '王五' }, [rec()]);
    expect(bin[0]).toBe(0x50);
    expect(bin[1]).toBe(0x4b);

    const wb = XLSX.read(bin, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Sheet1']);
    const ws = wb.Sheets['Sheet1'];
    expect(String(ws['A11'].v)).toContain('1');
    expect(ws['B11'].v).toBe('1路');
    expect(ws['C11'].v).toBe('粤B12345');
    expect(ws['D11'].v).toBe('张三');
    expect(ws['E11'].v).toBe('李四');
    expect(ws['F11'].v).toBe('08:00');
    expect(ws['G11'].v).toBe('08:30');
    expect(ws['H11'].v).toBe('总站');
    expect(ws['I11'].v).toBe('终点站');
    expect(ws['J11'].v).toBe('√');
    expect(ws['K11'].v).toBe('×');
    expect(ws['L11'] && ws['L11'].v).toBeFalsy();
    expect(ws['S31'].v).toContain('检查人:王五');
    expect(ws['S31'].v).toContain('检查日期:8月25日');
    expect(ws['B12'] && ws['B12'].v).toBeFalsy();
  });

  it('无售票员信息时 E 列自动写 /，有值写原名', () => {
    const bin = generate(
      { startDate: '2026-08-25', inspector: '王五' },
      [
        rec({ id: 'r1', conductor: '  ' }),
        rec({ id: 'r2', conductor: null, createdAt: '2026-08-25T09:00:00.000Z' }),
        rec({ id: 'r3', conductor: '赵六', createdAt: '2026-08-25T10:00:00.000Z' }),
      ]
    );
    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets['Sheet1'];
    expect(ws['E11'].v).toBe('/');
    expect(ws['E12'].v).toBe('/');
    expect(ws['E13'].v).toBe('赵六');
  });

  it('14 个检查项按序映射 √/×/空，第 14 项在 W 列', () => {
    const bin = generate(
      { startDate: '2026-08-25' },
      [rec({ item14: 'pass', item04: 'fail', item05: 'pass', item13: null })]
    );
    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets['Sheet1'];
    expect(ws['M11'].v).toBe('×');
    expect(ws['N11'].v).toBe('√');
    expect(ws['V11'] && ws['V11'].v).toBeFalsy();
    expect(ws['W11'].v).toBe('√');
  });

  it('跨天记录备注前置数字日期标记，起始日记录备注原样', () => {
    const bin = generate(
      { startDate: '2026-08-25', inspector: '王五' },
      [
        rec({ id: 'r1', inspectionDate: '2026-08-25', remark: '原备注' }),
        rec({ id: 'r2', inspectionDate: '2026-08-31', remark: '', createdAt: '2026-08-31T08:00:00.000Z' }),
        rec({ id: 'r3', inspectionDate: '2026-08-30', remark: '有问题', createdAt: '2026-08-30T08:00:00.000Z' }),
      ]
    );
    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets['Sheet1'];
    expect(ws['X11'].v).toBe('原备注');
    expect(ws['X12'].v).toBe('8.30,有问题');
    expect(ws['X13'].v).toBe('8.31');
  });

  it('记录按 inspectionDate+createdAt 排序后写入', () => {
    const bin = generate(
      { startDate: '2026-08-25' },
      [
        rec({ id: 'r1', inspectionDate: '2026-08-31', remark: '后', createdAt: '2026-08-31T08:00:00.000Z' }),
        rec({ id: 'r2', inspectionDate: '2026-08-25', remark: '前', createdAt: '2026-08-25T08:00:00.000Z' }),
      ]
    );
    const wb = XLSX.read(bin, { type: 'array' });
    const ws = wb.Sheets['Sheet1'];
    expect(ws['X11'].v).toBe('前');
    expect(ws['X12'].v).toBe('8.31,后');
  });

  it('超过 20 条自动追加工作表，每页 20 条且页脚一致', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      rec({
        id: 'r' + i,
        plateNumber: '粤B' + (i + 1),
        createdAt: '2026-08-25T' + String(i).padStart(2, '0') + ':00:00.000Z',
      })
    );
    const bin = generate({ startDate: '2026-08-25', inspector: '王五' }, rows);
    const wb = XLSX.read(bin, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Sheet1', 'Sheet2']);
    const s1 = wb.Sheets['Sheet1'];
    const s2 = wb.Sheets['Sheet2'];
    expect(s1['C30'].v).toBe('粤B20');
    expect(s2['C11'].v).toBe('粤B21');
    expect(s2['S31'].v).toContain('检查人:王五');
    expect(s2['S31'].v).toContain('检查日期:8月25日');
  });

  it('模板非数据部分原样保留（styles 一致、打印设置保留、多页注册完整）', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      rec({
        id: 'r' + i,
        plateNumber: '粤B' + (i + 1),
        createdAt: '2026-08-25T' + String(i).padStart(2, '0') + ':00:00.000Z',
      })
    );
    const bin = generate({ startDate: '2026-08-25', inspector: '王五' }, rows);
    const genParts = parseStoredZip(bin);
    const tplParts = parseStoredZip(tplBytes());
    expect(entry(genParts, 'xl/styles.xml')).toBe(entry(tplParts, 'xl/styles.xml'));
    const sheet1 = entry(genParts, 'xl/worksheets/sheet1.xml');
    expect(sheet1).toContain('pageSetup');
    expect(sheet1).toContain('orientation="landscape"');
    expect(genParts.some((e) => e.name === 'xl/worksheets/sheet2.xml')).toBe(true);
    const wbXml = entry(genParts, 'xl/workbook.xml');
    const ctXml = entry(genParts, '[Content_Types].xml');
    const relsXml = entry(genParts, 'xl/_rels/workbook.xml.rels');
    expect(wbXml).toContain('<sheet name="Sheet2"');
    expect(ctXml).toContain('/xl/worksheets/sheet2.xml');
    expect(relsXml).toContain('worksheets/sheet2.xml');
  });
});
