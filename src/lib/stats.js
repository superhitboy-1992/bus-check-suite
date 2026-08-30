import { CHECK_ITEMS } from './constants';
import { addDays, todayStr } from './dates';

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function computeStats(records, { period, date, route, inspector }) {
  const from = date;
  const to = period === 'day' ? date : todayStr();
  const filtered = records.filter(
    (r) =>
      r.inspectionDate >= from &&
      r.inspectionDate <= to &&
      (!route || (r.route || '').includes(route.trim())) &&
      (!inspector || (r.inspector || '').includes(inspector.trim()))
  );

  const itemStats = CHECK_ITEMS.map((item) => {
    let passCount = 0;
    let failCount = 0;
    for (const r of filtered) {
      const v = r[item.key];
      if (v === 'pass') passCount += 1;
      else if (v === 'fail') failCount += 1;
    }
    const checked = passCount + failCount;
    return {
      key: item.key,
      itemName: item.name,
      shortName: item.shortName,
      passCount,
      failCount,
      checked,
      passRate: checked > 0 ? round1((passCount / checked) * 100) : 0,
    };
  });

  const totalPass = itemStats.reduce((n, s) => n + s.passCount, 0);
  const totalFail = itemStats.reduce((n, s) => n + s.failCount, 0);
  const totalChecked = totalPass + totalFail;

  return {
    totalCount: filtered.length,
    overallPassRate: totalChecked > 0 ? round1((totalPass / totalChecked) * 100) : 0,
    overallFailRate: totalChecked > 0 ? round1((totalFail / totalChecked) * 100) : 0,
    itemStats,
    topFailItems: itemStats
      .filter((s) => s.failCount > 0)
      .sort((a, b) => b.failCount - a.failCount || a.itemName.localeCompare(b.itemName))
      .slice(0, 10)
      .map((s) => ({ itemName: s.itemName, failCount: s.failCount })),
  };
}
