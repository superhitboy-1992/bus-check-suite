/* 从仓库根目录的模板源文件生成内置模板 JS（不压缩 ZIP 的 base64，供导出时逐字节复用模板其余部分）
   用法：
     node tools/build-template.js                 # 生成驻站模板 src/lib/stationTemplate.js
     node tools/build-template.js --which jump    # 生成跳车模板 src/lib/jumpTemplate.js
   可选覆盖：--src --out --const --label --texts --refs */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- CRC32 ----------
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------- 读取 ZIP ----------
function parseZip(buf) {
  var eocd = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');
  var count = buf.readUInt16LE(eocd + 10);
  var cdOffset = buf.readUInt32LE(eocd + 16);
  var pos = cdOffset;
  var entries = [];
  for (var n = 0; n < count; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    var method = buf.readUInt16LE(pos + 10);
    var compSize = buf.readUInt32LE(pos + 20);
    var nameLen = buf.readUInt16LE(pos + 28);
    var extraLen = buf.readUInt16LE(pos + 30);
    var commentLen = buf.readUInt16LE(pos + 32);
    var localOffset = buf.readUInt32LE(pos + 42);
    var name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    var lNameLen = buf.readUInt16LE(localOffset + 26);
    var lExtraLen = buf.readUInt16LE(localOffset + 28);
    var dataStart = localOffset + 30 + lNameLen + lExtraLen;
    var data = buf.subarray(dataStart, dataStart + compSize);
    var dosTime = buf.readUInt16LE(localOffset + 10);
    var dosDate = buf.readUInt16LE(localOffset + 12);
    if (method === 8) {
      data = zlib.inflateRawSync(data);
    } else if (method !== 0) {
      throw new Error('不支持的压缩方式：' + name + ' method=' + method);
    }
    entries.push({ name: name, data: data, dosTime: dosTime, dosDate: dosDate });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ---------- 模板配置 ----------
var TEMPLATES = {
  station: {
    src: '驻站记录表【日期】.xlsx',
    out: 'src/lib/stationTemplate.js',
    constName: 'StationTemplate',
    label: '驻站记录表【日期】',
    texts: [
      '驻站站名:', '驻站人:', '日期',
      '序号', '线路', '车号', '过站时间', '上客人数',
      '进出站规范', '售票员招呼', '检查情况', '整改措施', '备注'
    ],
    refs: ['A2', 'E2', 'J2', 'B5', 'J34'],
  },
  jump: {
    src: '营运检查表-跳车及服务检查【日期】.xlsx',
    out: 'src/lib/jumpTemplate.js',
    constName: 'JumpTemplate',
    label: '营运检查表-跳车及服务检查【日期】',
    texts: [
      '检查人:', '检查日期:', '序号', '线路', '车牌', '自编号',
      '驾驶员', '售票员', '上车下车时间', '上车下车地点', '备注'
    ],
    refs: ['B11', 'C11', 'D11', 'E11', 'F11', 'G11', 'H11', 'I11', 'J11', 'W11', 'X11', 'S31'],
  },
};

// ---------- 结构校验 ----------
function validate(entries, label, texts, refs) {
  var sheet = null;
  var sst = null;
  entries.forEach(function (e) {
    if (e.name === 'xl/worksheets/sheet1.xml') sheet = e;
    if (e.name === 'xl/sharedStrings.xml') sst = e;
  });
  if (!sheet || !sst) throw new Error('模板缺少 xl/worksheets/sheet1.xml 或 xl/sharedStrings.xml（' + label + '）');

  var sheetXml = sheet.data.toString('utf8');
  var sstXml = sst.data.toString('utf8');
  texts.forEach(function (s) {
    if (sstXml.indexOf(s) === -1) throw new Error('模板缺少文本「' + s + '」，请确认使用的是《' + label + '》');
  });
  refs.forEach(function (ref) {
    if (sheetXml.indexOf('<c r="' + ref + '"') === -1) {
      throw new Error('模板缺少单元格 ' + ref + '，请确认使用的是《' + label + '》');
    }
  });
  return entries;
}

// ---------- 重打包为不压缩 ZIP ----------
function buildStoredZip(entries) {
  var chunks = [];
  var central = [];
  var offset = 0;
  entries.forEach(function (e) {
    var nameBuf = Buffer.from(e.name, 'utf8');
    var data = e.data;
    var crc = crc32(data);
    var dosTime = e.dosTime || 0;
    var dosDate = e.dosDate || 0;

    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8); // 存储
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    chunks.push(Buffer.concat([lh, nameBuf, data]));

    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, nameBuf]));
    offset += 30 + nameBuf.length + data.length;
  });

  var cdSize = central.reduce(function (s, b) { return s + b.length; }, 0);
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat(chunks.concat(central).concat([eocd]));
}

// ---------- 主流程 ----------
function argValue(name) {
  var i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

var which = argValue('which') || 'station';
var cfg = TEMPLATES[which];
if (!cfg) throw new Error('未知模板：' + which + '（可选 station / jump）');

var SRC = path.join(ROOT, argValue('src') || cfg.src);
var OUT = path.join(ROOT, argValue('out') || cfg.out);
var constName = argValue('const') || cfg.constName;
var label = argValue('label') || cfg.label;
var texts = argValue('texts') ? argValue('texts').split(',') : cfg.texts;
var refs = argValue('refs') ? argValue('refs').split(',') : cfg.refs;

var src = fs.readFileSync(SRC);
var entries = validate(parseZip(src), label, texts, refs);
var stored = buildStoredZip(entries);
var b64 = stored.toString('base64');

var js = '/* 内置模板：由 tools/build-template.js 从「' + label + '」自动生成，请勿手改。\n' +
  '   如更换模板，请重新运行 node tools/build-template.js --which ' + which + '。 */\n' +
  'export const ' + constName + ' = { base64: ' + JSON.stringify(b64) + ' };\n';

fs.writeFileSync(OUT, js, 'utf8');
console.log('已生成 ' + path.relative(ROOT, OUT) + '（' + stored.length + ' 字节，base64 ' + b64.length + ' 字符）');
