/* 驻站记录表.xlsx 导出器（纯前端、零依赖）
   以内置模板（src/lib/stationTemplate.js）为底稿，只向对应单元格写入登记数据，
   模板其余部分（样式、合并单元格、列宽行高、打印设置、WPS 元数据等）原样保留。
   写入位置：
   - A2：驻站站名: <站点>
   - E2：驻站人: <驻站人>
   - J2：日期（如 8月17日，文本，保留原单元格样式）
   - B5:J34：线路、车号、过站时间、上客人数、进出站规范、售票员招呼、
     检查情况、整改措施、备注（空值单元格保持模板原样）
*/
import { StationTemplate } from './stationTemplate';

const enc = new TextEncoder();
const dec = new TextDecoder();

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

    // 本地文件头
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

    // 中央目录
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
function parseStoredZip(bytes) {
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
function colRef(n) {
  let s = '';
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

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

// 模板列映射：B=线路 C=车号 D=过站时间 E=上客人数 F=进出站规范
// G=售票员招呼 H=检查情况 I=整改措施 J=备注
const DATA_COLS = ['', 'route', 'plate', 'time', 'boarding', 'stationNorms', 'conductorCall', 'checkResult', 'rectification', 'remark'];

function buildSheetXml(header, rows) {
  let xml = dec.decode(header._templateSheet);
  xml = patchCell(xml, 'A2', '驻站站名:' + (header.station || ''));
  xml = patchCell(xml, 'E2', '驻站人:' + (header.checker || ''));
  xml = patchCell(xml, 'J2', header.dateLabel || '');
  for (let i = 0; i < 30; i++) {
    const rec = rows[i];
    if (!rec) continue;
    for (let c = 1; c <= 9; c++) {
      const key = DATA_COLS[c];
      const v = rec[key];
      if (v === '' || v === null || v === undefined) continue;
      xml = patchCell(xml, colRef(c) + (i + 5), key === 'boarding' ? String(v) : v, key === 'boarding');
    }
  }
  return xml;
}

// ---------- 对外接口 ----------
export function generate(header, rows) {
  if (!StationTemplate || !StationTemplate.base64) {
    throw new Error('缺少内置模板 src/lib/stationTemplate.js，请重新部署');
  }
  const parts = parseStoredZip(decodeBase64(StationTemplate.base64));
  let sheetIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].name === 'xl/worksheets/sheet1.xml') {
      sheetIdx = i;
      break;
    }
  }
  if (sheetIdx < 0) throw new Error('内置模板缺少工作表');
  header._templateSheet = parts[sheetIdx].data;
  const xml = buildSheetXml(header, rows);
  delete header._templateSheet;
  const entries = [];
  for (let j = 0; j < parts.length; j++) {
    entries.push({
      name: parts[j].name,
      data: j === sheetIdx ? enc.encode(xml) : parts[j].data,
    });
  }
  return buildZip(entries);
}

export const zip = buildZip;
