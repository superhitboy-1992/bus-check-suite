import * as XLSX from 'xlsx';
import { EXPORT_HEADER, ITEM_KEYS } from './constants';
import { formatM_D } from './dates';

export function cellValue(status) {
  return status === 'pass' ? '√' : status === 'fail' ? '×' : '';
}

export function buildRows(records) {
  return records.map((r, idx) => [
    idx + 1,
    r.route,
    r.plateNumber,
    r.driver,
    r.conductor,
    r.boardTime,
    r.boardLocation,
    r.alightTime,
    r.alightLocation,
    ...ITEM_KEYS.map((k) => cellValue(r[k])),
    r.remark,
    r.inspector,
    r.inspectionDate,
  ]);
}

export function toCSV(rows) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
  return `\uFEFF${body}`;
}

export function buildCSVBlob(records) {
  return new Blob([toCSV([EXPORT_HEADER, ...buildRows(records)])], { type: 'text/csv;charset=utf-8;' });
}

export function buildXLSXBlob(rows) {
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADER, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '检查记录');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFilename(startDate, format) {
  return `营运检查表-跳车及服务检查【${formatM_D(startDate)}】.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
}
