import { ITEM_KEYS } from './constants';

export function failCount(record) {
  return ITEM_KEYS.reduce((n, k) => (record[k] === 'fail' ? n + 1 : n), 0);
}

export function matchRecord(record, filters) {
  const { dateFrom, dateTo, route, plateNumber, inspector } = filters || {};
  if (dateFrom && record.inspectionDate < dateFrom) return false;
  if (dateTo && record.inspectionDate > dateTo) return false;
  if (route && !(record.route || '').includes(route.trim())) return false;
  if (plateNumber && !(record.plateNumber || '').includes(plateNumber.trim())) return false;
  if (inspector && !(record.inspector || '').includes(inspector.trim())) return false;
  return true;
}

// 台账列表：检查日期倒序，创建时间倒序
export function sortList(records) {
  return [...records].sort((a, b) => {
    const d = String(b.inspectionDate || '').localeCompare(String(a.inspectionDate || ''));
    return d !== 0 ? d : String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

// 当日表格：按创建时间升序（录入顺序）
export function sortDaily(records) {
  return [...records].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// 导出：检查日期升序，创建时间升序
export function sortExport(records) {
  return [...records].sort((a, b) => {
    const d = String(a.inspectionDate || '').localeCompare(String(b.inspectionDate || ''));
    return d !== 0 ? d : String(a.createdAt).localeCompare(String(b.createdAt));
  });
}
