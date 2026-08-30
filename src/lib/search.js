/* 模糊搜索：汉字子串 + 拼音首字母/全拼（pinyin-pro） */
import { pinyin } from 'pinyin-pro';

function normQuery(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().trim();
}

// 匹配键：统一括号、去掉空白、转小写（不改变展示名称）
export function keyOf(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const _pyCache = {};

export function pinyinInfo(name) {
  if (!name) return null;
  if (_pyCache[name]) return _pyCache[name];
  let arr;
  try {
    arr = pinyin(name, { toneType: 'none', type: 'array', nonZh: 'consecutive', v: false });
  } catch (e) {
    arr = [];
  }
  const full = arr.join('');
  const initial = arr.map((p) => p.charAt(0)).join('');
  const info = { initial, full };
  _pyCache[name] = info;
  return info;
}

// 返回 [{ value, score }]，优先级：精确 > 前缀 > 子串 > 拼音首字母 > 全拼
export function search(list, query, max) {
  const q = normQuery(query);
  const results = [];
  if (!q) {
    (list || []).forEach((v, i) => {
      results.push({ value: v, score: 0, order: i });
    });
  } else {
    const qKey = keyOf(q);
    const asciiQuery = /^[a-z0-9]+$/.test(q);
    (list || []).forEach((v, i) => {
      const k = keyOf(v);
      let score = -1;
      if (k === qKey) score = 0;
      else if (k.indexOf(qKey) === 0) score = 1;
      else if (k.indexOf(qKey) > 0) score = 2;
      else if (asciiQuery) {
        const info = pinyinInfo(v);
        if (info) {
          if (info.initial.indexOf(q) === 0) score = 3;
          else if (info.initial.indexOf(q) > 0) score = 4;
          else if (info.full.indexOf(q) >= 0) score = 5;
        }
      }
      if (score >= 0) results.push({ value: v, score, order: i });
    });
  }
  results.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.value.length !== b.value.length) return a.value.length - b.value.length;
    return a.order - b.order;
  });
  if (max > 0 && results.length > max) results.length = max;
  return results;
}
