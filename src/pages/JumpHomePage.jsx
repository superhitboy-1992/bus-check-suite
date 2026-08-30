import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHECK_ITEMS, ITEM_KEYS } from '../lib/constants';
import { deleteRecord, restoreLastDeleted, useRecords, useStoragePressure } from '../lib/storage';
import { failCount, matchRecord, sortDaily, sortList } from '../lib/filter';
import { todayStr } from '../lib/dates';
import { Icon } from '../components/icons';
import { Badge, Button, Card, ConfirmDialog, DateInput, EmptyState, Input, SegmentedTabs, toast } from '../components/ui';

const PAGE_SIZE = 20;

function ResultBadge({ count }) {
  if (count === 0) {
    return <Badge variant="success">合格</Badge>;
  }
  return <Badge variant="destructive">{count} 项不合格</Badge>;
}

function FilterBar({ filters, onChange, onSearch, onReset }) {
  const [open, setOpen] = useState(false);
  const fields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">起始日期</label>
        <DateInput value={filters.dateFrom || ''} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })} placeholder="选择起始日期" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">结束日期</label>
        <DateInput value={filters.dateTo || ''} onChange={(e) => onChange({ ...filters, dateTo: e.target.value })} placeholder="选择结束日期" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">线路</label>
        <Input placeholder="请输入线路" value={filters.route || ''} onChange={(e) => onChange({ ...filters, route: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">车牌/自编号</label>
        <Input placeholder="请输入车牌" value={filters.plateNumber || ''} onChange={(e) => onChange({ ...filters, plateNumber: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
        <label className="text-xs text-muted-foreground">检查人</label>
        <Input placeholder="请输入检查人" value={filters.inspector || ''} onChange={(e) => onChange({ ...filters, inspector: e.target.value })} />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button onClick={onSearch}>
          <Icon name="search" className="size-4" />
          查询
        </Button>
        <Button variant="outline" onClick={onReset}>
          <Icon name="refresh" className="size-4" />
          重置
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="rounded-xl shadow-sm">
      <div className="p-5">
        <div className="hidden md:block">{fields}</div>
        <div className="md:hidden">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setOpen((v) => !v)}>
              <Icon name="filter" className="size-4" />
              筛选
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onReset}>
                <Icon name="refresh" className="size-4" />
                重置
              </Button>
              <Button onClick={onSearch}>
                <Icon name="search" className="size-4" />
                查询
              </Button>
            </div>
          </div>
          {open && <div className="mt-4">{fields}</div>}
        </div>
      </div>
    </Card>
  );
}

function ListTable({ items, onRowClick, onEdit, onDelete }) {
  const navigate = useNavigate();
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 px-2 font-medium">线路</th>
            <th className="py-2 px-2 font-medium">车牌</th>
            <th className="py-2 px-2 font-medium">驾驶员</th>
            <th className="py-2 px-2 font-medium">检查日期</th>
            <th className="py-2 px-2 font-medium">检查人</th>
            <th className="py-2 px-2 font-medium">结果</th>
            <th className="py-2 px-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/30"
              onClick={() => onRowClick(s.id)}
            >
              <td className="py-3 px-2 font-medium">{s.route}</td>
              <td className="py-3 px-2 font-mono">{s.plateNumber}</td>
              <td className="py-3 px-2">{s.driver}</td>
              <td className="py-3 px-2 text-muted-foreground">{s.inspectionDate}</td>
              <td className="py-3 px-2">{s.inspector}</td>
              <td className="py-3 px-2">
                <ResultBadge count={failCount(s)} />
              </td>
              <td className="py-3 px-2">
                <div className="flex items-center justify-end gap-1">
                  <Button size="iconSm" variant="ghost" aria-label="编辑" onClick={(e) => onEdit(s.id, e)}>
                    <Icon name="pencil" className="size-4" />
                  </Button>
                  <Button size="iconSm" variant="ghost" aria-label="删除" className="text-destructive" onClick={(e) => onDelete(s, e)}>
                    <Icon name="trash" className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileList({ items, onRowClick, onEdit, onDelete }) {
  return (
    <div className="space-y-3 md:hidden">
      {items.map((o) => (
        <Card key={o.id} className="cursor-pointer">
          <div className="p-4" onClick={() => onRowClick(o.id)}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">
                {o.route} 路
              </span>
              <ResultBadge count={failCount(o)} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">车牌：</span>
                <span className="font-mono">{o.plateNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">驾驶员：</span>
                <span>{o.driver}</span>
              </div>
              <div>
                <span className="text-muted-foreground">检查日期：</span>
                <span>{o.inspectionDate}</span>
              </div>
              <div>
                <span className="text-muted-foreground">检查人：</span>
                <span>{o.inspector}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border p-3 pt-3">
            <Button variant="outline" size="sm" onClick={(e) => onEdit(o.id, e)}>
              <Icon name="pencil" className="size-4" />
              编辑
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={(e) => onDelete(o, e)}>
              <Icon name="trash" className="size-4" />
              删除
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Pagination({ page, pageSize, total, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== 'ellipsis') pages.push('ellipsis');
  }
  return (
    <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <div className="text-sm text-muted-foreground">
        共 <span className="font-mono">{total}</span> 条
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <Icon name="chevronLeft" className="size-4" />
        </Button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-2 text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? 'default' : 'outline'}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        )}
        <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <Icon name="chevronRight" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function DailyTable({ items, date }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      {items.length === 0 ? (
        <EmptyState
          title="当日暂无检查记录"
          description="当日还没有检查记录"
          action={
            <Button onClick={() => navigate('/new')}>
              <Icon name="plus" className="size-4" />
              去新建
            </Button>
          }
        />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-accent/40">
              <th className="w-12 border border-border py-2 px-2 text-center font-medium">序号</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">线路</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">车牌/自编号</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">驾驶员</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">售票员</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">上车时间/地点</th>
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">下车时间/地点</th>
              {ITEM_KEYS.map((k) => {
                const item = CHECK_ITEMS.find((c) => c.key === k);
                return (
                  <th key={k} title={item.name} className="border border-border py-2 px-1.5 text-center font-medium whitespace-nowrap">
                    {item.shortName}
                  </th>
                );
              })}
              <th className="border border-border py-2 px-2 text-left font-medium whitespace-nowrap">备注</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, idx) => {
              const count = failCount(r);
              return (
                <tr key={r.id} className="transition-colors hover:bg-accent/20">
                  <td className="border border-border py-2 px-2 text-center font-mono">{idx + 1}</td>
                  <td className="border border-border py-2 px-2 whitespace-nowrap">{r.route}</td>
                  <td className="border border-border py-2 px-2 font-mono whitespace-nowrap">{r.plateNumber}</td>
                  <td className="border border-border py-2 px-2 whitespace-nowrap">{r.driver}</td>
                  <td className="border border-border py-2 px-2 whitespace-nowrap">{r.conductor}</td>
                  <td className="border border-border py-2 px-2 whitespace-nowrap">
                    {r.boardTime} / {r.boardLocation}
                  </td>
                  <td className="border border-border py-2 px-2 whitespace-nowrap">
                    {r.alightTime} / {r.alightLocation}
                  </td>
                  {ITEM_KEYS.map((k) => {
                    const v = r[k];
                    return (
                      <td key={k} className="border border-border py-2 px-1.5 text-center">
                        {v === 'pass' ? (
                          <span className="font-mono font-bold text-[hsl(145_65%_42%)]">√</span>
                        ) : v === 'fail' ? (
                          <span className="font-mono font-bold text-[hsl(0_72%_51%)]">×</span>
                        ) : (
                          <span className="font-mono text-muted-foreground">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border border-border py-2 px-2 whitespace-nowrap text-muted-foreground">
                    {r.remark || '-'}
                    {count > 0 && <ResultBadge count={count} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const records = useRecords();
  const storagePressure = useStoragePressure();
  const [view, setView] = useState('list');
  const [draftFilters, setDraftFilters] = useState({});
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(() => todayStr());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(
    () => sortList(records.filter((r) => matchRecord(r, filters))),
    [records, filters]
  );
  const dailyItems = useMemo(
    () => sortDaily(records.filter((r) => r.inspectionDate === date)),
    [records, date]
  );

  const applyFilters = (next) => {
    setFilters(next);
    setPage(1);
  };
  const resetFilters = () => {
    setDraftFilters({});
    applyFilters({});
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      deleteRecord(deleteTarget.id);
      toast('删除成功', 'success', {
        action: {
          label: '撤销',
          onClick: () => {
            restoreLastDeleted();
            toast('已恢复删除的记录');
          },
        },
      });
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const currentPageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {(storagePressure.overLimit || storagePressure.quotaFailed) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon name="alert" className="size-4 shrink-0 text-warning" />
            本地存储空间不足，记录可能无法保存
          </span>
          <Button size="sm" variant="outline" onClick={() => navigate('/basic-data')}>
            去备份
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">检查台账</h1>
        <div className="flex items-center gap-2">
          <SegmentedTabs
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: '列表视图', icon: 'list' },
              { value: 'daily', label: '当日表格', icon: 'table' },
            ]}
          />
          <Button onClick={() => navigate('/new')} className="hidden sm:inline-flex">
            <Icon name="plus" className="size-4" />
            新建检查
          </Button>
        </div>
      </div>

      {view === 'list' && (
        <>
          <FilterBar
            filters={draftFilters}
            onChange={setDraftFilters}
            onSearch={() => applyFilters(draftFilters)}
            onReset={resetFilters}
          />
          <Card>
            <div className="p-5">
              {filtered.length === 0 ? (
                <EmptyState
                  title="暂无检查记录"
                  description="还没有检查记录，快去新建一条吧"
                  action={
                    <Button onClick={() => navigate('/new')}>
                      <Icon name="plus" className="size-4" />
                      去新建
                    </Button>
                  }
                />
              ) : (
                <>
                  <ListTable
                    items={currentPageItems}
                    onRowClick={(id) => navigate(`/detail/${id}`)}
                    onEdit={(id, e) => {
                      e.stopPropagation();
                      navigate(`/edit/${id}`);
                    }}
                    onDelete={(rec, e) => {
                      e.stopPropagation();
                      setDeleteTarget(rec);
                    }}
                  />
                  <MobileList
                    items={currentPageItems}
                    onRowClick={(id) => navigate(`/detail/${id}`)}
                    onEdit={(id, e) => {
                      e.stopPropagation();
                      navigate(`/edit/${id}`);
                    }}
                    onDelete={(rec, e) => {
                      e.stopPropagation();
                      setDeleteTarget(rec);
                    }}
                  />
                  <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
                </>
              )}
            </div>
          </Card>
        </>
      )}

      {view === 'daily' && (
        <Card>
          <div className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">日期：</span>
                <DateInput value={date} onChange={(e) => setDate(e.target.value)} placeholder="选择日期" />
              </div>
              <Button variant="outline" onClick={() => window.print()}>
                <Icon name="print" className="size-4" />
                打印
              </Button>
            </div>
            <DailyTable items={dailyItems} date={date} />
          </div>
        </Card>
      )}

      <Button
        onClick={() => navigate('/new')}
        aria-label="新建检查"
        className="no-print fixed right-5 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex size-14 rounded-full bg-primary text-primary-foreground shadow-lg sm:hidden"
      >
        <Icon name="plus" className="size-6" />
      </Button>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        description={
          deleteTarget
            ? `确定要删除线路 ${deleteTarget.route}（车牌 ${deleteTarget.plateNumber}）的检查记录吗？此操作不可恢复。`
            : ''
        }
        busy={deleteBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
