import { useMemo, useState } from 'react';
import { useRecords } from '../lib/storage';
import { computeStats } from '../lib/stats';
import { periodLabel, periodStartDate } from '../lib/dates';
import { Icon } from '../components/icons';
import { Button, Card, EmptyState, Input, SegmentedTabs } from '../components/ui';

function StatCard({ icon, label, value, suffix, valueClassName, iconClassName }) {
  return (
    <Card className="rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="mb-2 text-sm text-muted-foreground">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-semibold ${valueClassName || ''}`}>{value}</span>
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClassName || 'bg-primary/10 text-primary'}`}>
          <Icon name={icon} className="size-5" />
        </div>
      </div>
    </Card>
  );
}

function PassRateChart({ itemStats }) {
  const maxRate = Math.max(100, ...itemStats.map((s) => s.passRate));
  return (
    <div className="flex h-64 items-end gap-1.5 md:h-80">
      {itemStats.map((s) => (
        <div
          key={s.key}
          title={`${s.itemName}：${s.passRate}%`}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
        >
          <span className="text-[10px] font-medium text-foreground">{s.passRate}%</span>
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max((s.passRate / maxRate) * 100, 1.5)}%`,
              backgroundColor: `hsl(210 85% ${40 + (s.passRate / 100) * 20}%)`,
            }}
          />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground" title={s.itemName}>
            {s.shortName}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopFailChart({ items }) {
  if (items.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground md:h-80">暂无不合格项数据</div>;
  }
  const maxFail = items[0].failCount;
  return (
    <div className="flex h-64 flex-col justify-center gap-3 md:h-80">
      {items.map((it) => (
        <div key={it.itemName} className="flex items-center gap-3">
          <span className="w-24 truncate text-right text-xs text-muted-foreground" title={it.itemName}>
            {it.itemName}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-accent">
            <div
              className="flex h-full items-center rounded bg-[hsl(35_90%_52%)]"
              style={{ width: `${Math.max((it.failCount / maxFail) * 100, 6)}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-sm">{it.failCount}</span>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const records = useRecords();
  const [period, setPeriod] = useState('day');
  const [draftRoute, setDraftRoute] = useState('');
  const [draftInspector, setDraftInspector] = useState('');
  const [route, setRoute] = useState('');
  const [inspector, setInspector] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const date = periodStartDate(period);
  const stats = useMemo(
    () => computeStats(records, { period, date, route, inspector }),
    [records, period, date, route, inspector]
  );

  const applyFilters = () => {
    setRoute(draftRoute.trim());
    setInspector(draftInspector.trim());
  };
  const resetFilters = () => {
    setDraftRoute('');
    setDraftInspector('');
    setRoute('');
    setInspector('');
  };

  const filterRow = (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Icon name="search" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="线路"
          value={draftRoute}
          onChange={(e) => setDraftRoute(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          className="w-36 pl-8"
        />
      </div>
      <div className="relative">
        <Icon name="search" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="检查人"
          value={draftInspector}
          onChange={(e) => setDraftInspector(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          className="w-36 pl-8"
        />
      </div>
      <Button size="sm" onClick={applyFilters}>
        查询
      </Button>
      <Button size="sm" variant="outline" onClick={resetFilters}>
        重置
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <SegmentedTabs
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'day', label: '日' },
                { value: 'week', label: '周' },
                { value: 'month', label: '月' },
              ]}
            />
            <div className="flex items-center justify-between md:hidden">
              <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} className="w-full gap-2">
                <Icon name="filter" className="size-4" />
                筛选条件
              </Button>
            </div>
            <div className="hidden md:flex">{filterRow}</div>
          </div>
          {showFilters && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 md:hidden">
              <Input placeholder="线路" value={draftRoute} onChange={(e) => setDraftRoute(e.target.value)} />
              <Input placeholder="检查人" value={draftInspector} onChange={(e) => setDraftInspector(e.target.value)} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={applyFilters}>
                  查询
                </Button>
                <Button variant="outline" className="flex-1" onClick={resetFilters}>
                  重置
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {stats.totalCount === 0 ? (
        <Card>
          <EmptyState
            icon="chart"
            title="暂无统计数据"
            description={`当前${periodLabel(period)}周期内没有检查记录`}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard icon="clipboard" label="检查车次总数" value={stats.totalCount} iconClassName="bg-primary/10 text-primary" />
            <StatCard
              icon="circleCheck"
              label="整体合格率"
              value={stats.overallPassRate}
              suffix="%"
              valueClassName="text-success"
              iconClassName="bg-success/10 text-success"
            />
            <StatCard
              icon="alert"
              label="整体不合格率"
              value={stats.overallFailRate}
              suffix="%"
              valueClassName="text-destructive"
              iconClassName="bg-destructive/10 text-destructive"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <div className="p-5">
                <h2 className="pb-4 text-base font-semibold">项目合格率</h2>
                <PassRateChart itemStats={stats.itemStats} />
              </div>
            </Card>
            <Card>
              <div className="p-5">
                <h2 className="pb-4 text-base font-semibold">不合格项 Top 排行</h2>
                <TopFailChart items={stats.topFailItems} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
