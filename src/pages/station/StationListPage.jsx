import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import StationTabs from './StationTabs';
import { deleteStationRecord, useBasicData, useStationRecords } from '../../lib/storage';
import { normalize, normalizePlate } from '../../lib/stationCore';

function TickBadge({ value }) {
  if (value === '√') return <Badge variant="success">√</Badge>;
  if (value === '×') return <Badge variant="destructive">×</Badge>;
  return null;
}

export default function StationListPage() {
  const navigate = useNavigate();
  const records = useStationRecords();
  const basicData = useBasicData();
  const [filters, setFilters] = useState({ from: '', to: '', station: '', route: '', keyword: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const stationNames = useMemo(() => {
    const seen = new Set();
    const out = [];
    basicData.stations.forEach((s) => {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        out.push(s.name);
      }
    });
    return out;
  }, [basicData.stations]);
  const routeNames = basicData.routes.map((r) => r.name);

  const list = useMemo(() => {
    const { from, to, station, route, keyword } = filters;
    const kw = normalize(keyword);
    const kwNorm = normalizePlate(kw);
    return records
      .filter((r) => {
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        if (station && r.station !== station) return false;
        if (route && r.route !== route) return false;
        if (kw) {
          const hay = [r.plate, r.checkResult, r.remark, r.rectification, r.station, r.route, r.checker].join(' ');
          if (hay.indexOf(kw) < 0 && (kwNorm ? normalizePlate(r.plate).indexOf(kwNorm) < 0 : true)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const d = (b.date || '').localeCompare(a.date || '');
        if (d !== 0) return d;
        return (b.time || '').localeCompare(a.time || '');
      });
  }, [records, filters]);

  function resetFilters() {
    setFilters({ from: '', to: '', station: '', route: '', keyword: '' });
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteStationRecord(deleteTarget);
      toast('已删除');
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      <StationTabs />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="日期从">
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="至">
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <Field label="站点">
            <Input list="station-list" value={filters.station} onChange={(e) => setFilters({ ...filters, station: e.target.value })} placeholder="全部" />
          </Field>
          <Field label="线路">
            <Input list="route-list" value={filters.route} onChange={(e) => setFilters({ ...filters, route: e.target.value })} placeholder="全部" />
          </Field>
          <Field label="关键字">
            <Input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="车号/检查情况/备注" />
          </Field>
        </div>
        <datalist id="station-list">
          {stationNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="route-list">
          {routeNames.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => setFilters({ ...filters })}>
            查询
          </Button>
          <Button size="sm" variant="outline" onClick={resetFilters}>
            重置
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">共 {list.length} 条记录</span>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon="list" title="没有符合条件的记录" description="调整筛选条件，或先到「登记记录」页添加" />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-accent/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">日期</th>
                    <th className="px-3 py-2.5 font-medium">时间</th>
                    <th className="px-3 py-2.5 font-medium">站点</th>
                    <th className="px-3 py-2.5 font-medium">线路</th>
                    <th className="px-3 py-2.5 font-medium">车号</th>
                    <th className="px-3 py-2.5 font-medium">上客</th>
                    <th className="px-3 py-2.5 font-medium">规范</th>
                    <th className="px-3 py-2.5 font-medium">招呼</th>
                    <th className="px-3 py-2.5 font-medium">检查情况</th>
                    <th className="px-3 py-2.5 font-medium">整改</th>
                    <th className="px-3 py-2.5 font-medium">备注</th>
                    <th className="px-3 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.time}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.station}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.route}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.plate}</td>
                      <td className="px-3 py-2.5">{r.boarding === '' || r.boarding == null ? '0' : r.boarding}</td>
                      <td className="px-3 py-2.5">
                        <TickBadge value={r.stationNorms} />
                      </td>
                      <td className="px-3 py-2.5">
                        <TickBadge value={r.conductorCall} />
                      </td>
                      <td className="px-3 py-2.5">{r.checkResult}</td>
                      <td className="px-3 py-2.5">{r.rectification}</td>
                      <td className="px-3 py-2.5">{r.remark}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => navigate('/station/reg', { state: { editId: r.id } })}>
                            编辑
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(r.id)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {list.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{r.time || '--:--'}</span>
                  <span className="text-sm font-medium text-foreground">{r.route}</span>
                  <span className="font-mono text-sm text-foreground">{r.plate}</span>
                  <span className="ml-auto flex gap-1">
                    <TickBadge value={r.stationNorms} />
                    <TickBadge value={r.conductorCall} />
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {r.date} · {r.station} · 上客 {r.boarding === '' || r.boarding == null ? '0' : r.boarding}
                </p>
                {(r.checkResult || r.rectification || r.remark) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {[r.checkResult, r.rectification, r.remark].filter(Boolean).join(' / ')}
                  </p>
                )}
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/station/reg', { state: { editId: r.id } })}>
                    编辑
                  </Button>
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => setDeleteTarget(r.id)}>
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">删除记录</h2>
            <p className="mt-2 text-sm text-muted-foreground">确定删除这条记录吗？此操作不可恢复。</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="history" className="size-3.5" />
        支持按日期、站点、线路与关键字筛选；车号关键字会自动忽略空格与横线。
      </p>
    </div>
  );
}
