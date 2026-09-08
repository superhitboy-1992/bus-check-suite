/* 站名格式规范：括号统一半角 () 且紧贴前文、无空白；
   停用站标记与查询工具（本地与远程资料库共用） */

export function canonicalStationName(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/^\*+/, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[\s\u3000]+/g, '');
}

export function hasFullwidthParens(name) {
  return /[（）]/.test(String(name || ''));
}

export function isStationRetired(item) {
  return Boolean(item && item.retired === true);
}

export function stationKey(name, routeName) {
  return String(name || '').trim() + '|' + String(routeName || '').trim();
}
