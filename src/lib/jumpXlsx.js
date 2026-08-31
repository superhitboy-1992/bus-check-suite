/* 营运检查表-跳车及服务检查.xlsx 导出器（纯前端、零依赖）
   以内置模板（src/lib/jumpTemplate.js）为底稿，只向对应单元格写入登记数据，
   模板其余部分（样式、合并单元格、列宽行高、打印设置等）原样保留。
   写入位置：
   - 数据区第 11–30 行：B=线路 C=车牌/自编号 D=驾驶员 E=售票员（空值写“/”）
     F=上车时间 G=下车时间 H=上车地点 I=下车地点 J–W=14 个检查项（√/×/空）
     X=备注（跨天记录前置数字日期标记，如 8.31,原备注）
   - S31 页脚合并格：检查人: <姓名> 检查日期: <M月D日>（只写起始日期）
   - 记录超过 20 条时自动追加工作表（Sheet2/Sheet3…），每页 20 条、页脚相同 */
import { JumpTemplate } from './jumpTemplate';

const enc = new TextEncoder();
const dec = new TextDecoder();

const DATA_START_ROW = 11; // 模板数据区固定 20 行（第 11–30 行）
const ROWS_PER_PAGE = 20;

// 模板列映射（A=序号 模板已预填，B..X 为数据列）
const DATA_COLS = {
  B: 'route',
  C: 'plateNumber',
  D: 'driver',
  E: 'conductor', // 无售票员信息时写“/”
  F: 'boardTime',
  G: 'alightTime',
  H: 'boardLocation',
  I: 'alightLocation',
  J: 'item01',
  K: 'item02',
  L: 'item03',
  M: 'item04',
  N: 'item05',
  O: 'item06',
  P: 'item07',
  Q: 'item08',
  R: 'item09',
  S: 'item10',
  T: 'item11',
  U: 'item12',
  V: 'item13',
  W: 'item14',
  X: 'remark',
};

// 页脚原文（与模板 S31 完全一致）：检查人: + 36 空格 + 检查日期:
const FOOTER_BASE = '检查人:                                    检查日期:';

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- 字符串转义 ----------
function esc(s) {
  return String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- ZIP（仅存储不压缩，Excel / WPS 均可正常打开） ----------
function dosDateTime(d) {
  const date =
    ((Math.max(d.getFullYear() - 1980, 0) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  return { date, time };
}

function buildZip(entries) {
  const now = dosDateTime(new Date());
  const chunks = [];
  const central = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const nameBytes = enc.encode(entries[i].name);
    const data = entries[i].data;
    const crc = crc32(data);
    const size = data.length;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 文件名
    lh.setUint16(8, 0, true); // 方法：存储
    lh.setUint16(10, now.time, true);
    lh.setUint16(12, now.date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    const local = new Uint8Array(30 + nameBytes.length + size);
    local.set(new Uint8Array(lh.buffer), 0);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, now.time, true);
    ch.setUint16(14, now.date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    const cent = new Uint8Array(46 + nameBytes.length);
    cent.set(new Uint8Array(ch.buffer), 0);
    cent.set(nameBytes, 46);
    central.push(cent);

    offset += local.length;
  }

  let cdSize = 0;
  for (let j = 0; j < central.length; j++) cdSize += central[j].length;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (let k = 0; k < chunks.length; k++) {
    out.set(chunks[k], pos);
    pos += chunks[k].length;
  }
  for (let m = 0; m < central.length; m++) {
    out.set(central[m], pos);
    pos += central[m].length;
  }
  out.set(new Uint8Array(eocd.buffer), pos);
  return out;
}

// ---------- 解析不压缩 ZIP（内置模板经 tools/build-template.js 重打包为存储方式） ----------
export function parseStoredZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const entries = [];
  while (pos + 30 <= bytes.length) {
    if (dv.getUint32(pos, true) !== 0x04034b50) break;
    const method = dv.getUint16(pos + 8, true);
    const compSize = dv.getUint32(pos + 18, true);
    const nameLen = dv.getUint16(pos + 26, true);
    const extraLen = dv.getUint16(pos + 28, true);
    const name = dec.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    if (method !== 0) {
      throw new Error('内置模板包含压缩条目：' + name + '，请重新运行 tools/build-template.js');
    }
    if (name && name.charAt(name.length - 1) !== '/') {
      entries.push({
        name,
        data: bytes.subarray(pos + 30 + nameLen + extraLen, pos + 30 + nameLen + extraLen + compSize),
      });
    }
    pos += 30 + nameLen + extraLen + compSize;
  }
  return entries;
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- 单元格写入（原位替换，保留原单元格属性与样式） ----------
function patchCell(xml, ref, value, isNum) {
  if (value === undefined || value === null || value === '') return xml;
  const m = xml.match(new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>[\\s\\S]*?</c>)'));
  if (!m) throw new Error('内置模板缺少单元格：' + ref);
  const head = m[0].match(/^<c r="[^"]*"([^>]*)/);
  const attrs = (head ? head[1] : '')
    .replace(/\s*t="[^"]*"/g, '')
    .replace(/\/\s*$/, '')
    .trim();
  const prefix = '<c r="' + ref + '"' + (attrs ? ' ' + attrs : '');
  const cell = isNum
    ? prefix + '><v>' + value + '</v></c>'
    : prefix + ' t="inlineStr"><is><t>' + esc(value) + '</t></is></c>';
  return xml.slice(0, m.index) + cell + xml.slice(m.index + m[0].length);
}

// ---------- 日期格式 ----------
function mD(dateStr) {
  const [, m, d] = String(dateStr).split('-');
  return `${parseInt(m, 10)}.${parseInt(d, 10)}`;
}

function mDCN(dateStr) {
  const [, m, d] = String(dateStr).split('-');
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function cellValue(status) {
  return status === 'pass' ? '√' : status === 'fail' ? '×' : '';
}

// 跨天记录在备注前置数字日期标记；起始日记录备注原样
function remarkFor(rec, startDate) {
  const date = rec.inspectionDate == null ? '' : String(rec.inspectionDate);
  const marker = date && date !== startDate ? mD(date) : '';
  const remark = rec.remark == null ? '' : String(rec.remark);
  if (!marker) return remark;
  return remark === '' ? marker : marker + ',' + remark;
}

function buildSheetXml(templateSheet, pagesInfo) {
  let xml = dec.decode(templateSheet);
  const footerText = FOOTER_BASE.replace('检查人:', '检查人:' + pagesInfo.inspector).replace(
    '检查日期:',
    '检查日期:' + pagesInfo.dateLabel
  );
  xml = patchCell(xml, 'S31', footerText);
  const startDate = pagesInfo.startDate;
  for (let i = 0; i < ROWS_PER_PAGE; i++) {
    const rec = pagesInfo.rows[i];
    if (!rec) continue;
    const row = DATA_START_ROW + i;
    for (const col of Object.keys(DATA_COLS)) {
      const key = DATA_COLS[col];
      let v = rec[key];
      if (key === 'conductor') {
        v = String(v == null ? '' : v).trim() === '' ? '/' : v;
      }
      if (key === 'remark') v = remarkFor(rec, startDate);
      if (key.startsWith('item')) v = cellValue(v);
      if (v === '' || v === null || v === undefined) continue;
      xml = patchCell(xml, col + row, v);
    }
  }
  return xml;
}

// ---------- 多工作表注册 ----------
function patchWorkbookXml(xml, sheetCount, ridBase) {
  let extra = '';
  for (let i = 2; i <= sheetCount; i++) {
    extra += '<sheet name="Sheet' + i + '" sheetId="' + i + '" r:id="rId' + (ridBase + i - 2) + '"/>';
  }
  if (!extra) return xml;
  if (xml.indexOf('</sheets>') === -1) throw new Error('内置模板 workbook.xml 缺少 </sheets>');
  return xml.replace('</sheets>', extra + '</sheets>');
}

function patchRelsXml(xml, sheetCount, ridBase) {
  let extra = '';
  for (let i = 2; i <= sheetCount; i++) {
    extra +=
      '<Relationship Id="rId' +
      (ridBase + i - 2) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
      i +
      '.xml"/>';
  }
  if (!extra) return xml;
  if (xml.indexOf('</Relationships>') === -1) throw new Error('内置模板 workbook.xml.rels 缺少 </Relationships>');
  return xml.replace('</Relationships>', extra + '</Relationships>');
}

function patchContentTypesXml(xml, sheetCount) {
  let extra = '';
  for (let i = 2; i <= sheetCount; i++) {
    extra +=
      '<Override PartName="/xl/worksheets/sheet' +
      i +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }
  if (!extra) return xml;
  if (xml.indexOf('</Types>') === -1) throw new Error('内置模板 [Content_Types].xml 缺少 </Types>');
  return xml.replace('</Types>', extra + '</Types>');
}

// ---------- 对外接口 ----------
export function generate(header, rows) {
  if (!JumpTemplate || !JumpTemplate.base64) {
    throw new Error('缺少内置模板 src/lib/jumpTemplate.js，请重新部署');
  }
  const sorted = [...rows].sort((a, b) => {
    const d = String(a.inspectionDate || '').localeCompare(String(b.inspectionDate || ''));
    return d !== 0 ? d : String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  const startDate = header.startDate || (sorted[0] && sorted[0].inspectionDate) || '';
  const pagesInfo = {
    startDate,
    inspector: header.inspector || (sorted[0] && sorted[0].inspector) || '',
    dateLabel: header.dateLabel || mDCN(startDate),
  };

  const pages = [];
  for (let i = 0; i < sorted.length; i += ROWS_PER_PAGE) {
    pages.push({ rows: sorted.slice(i, i + ROWS_PER_PAGE) });
  }
  if (pages.length === 0) pages.push({ rows: [] });

  const parts = parseStoredZip(decodeBase64(JumpTemplate.base64));
  let sheetIdx = -1;
  let workbookIdx = -1;
  let relsIdx = -1;
  let ctIdx = -1;
  for (let j = 0; j < parts.length; j++) {
    if (parts[j].name === 'xl/worksheets/sheet1.xml') sheetIdx = j;
    if (parts[j].name === 'xl/workbook.xml') workbookIdx = j;
    if (parts[j].name === 'xl/_rels/workbook.xml.rels') relsIdx = j;
    if (parts[j].name === '[Content_Types].xml') ctIdx = j;
  }
  if (sheetIdx < 0) throw new Error('内置模板缺少工作表');
  if (workbookIdx < 0 || relsIdx < 0 || ctIdx < 0) throw new Error('内置模板缺少 workbook/rels/Content_Types');

  const relsXml = dec.decode(parts[relsIdx].data);
  const rids = [...relsXml.matchAll(/rId(\d+)/g)].map((m) => parseInt(m[1], 10));
  const ridBase = Math.max(0, ...rids) + 1;

  const entries = [];
  for (let j = 0; j < parts.length; j++) {
    let data = parts[j].data;
    if (j === sheetIdx) {
      data = enc.encode(buildSheetXml(parts[j].data, { ...pagesInfo, rows: pages[0].rows }));
    } else if (j === workbookIdx) {
      data = enc.encode(patchWorkbookXml(dec.decode(data), pages.length, ridBase));
    } else if (j === relsIdx) {
      data = enc.encode(patchRelsXml(dec.decode(data), pages.length, ridBase));
    } else if (j === ctIdx) {
      data = enc.encode(patchContentTypesXml(dec.decode(data), pages.length));
    }
    entries.push({ name: parts[j].name, data });
  }
  for (let i = 1; i < pages.length; i++) {
    entries.push({
      name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
      data: enc.encode(buildSheetXml(parts[sheetIdx].data, { ...pagesInfo, rows: pages[i].rows })),
    });
  }
  return buildZip(entries);
}

export const zip = buildZip;
