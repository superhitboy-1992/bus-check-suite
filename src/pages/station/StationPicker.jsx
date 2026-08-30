import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import { Icon } from '../../components/icons';
import { search } from '../../lib/search';

function GroupItem({ label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{count} 条</span>
    </button>
  );
}

function ItemButton({ value, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
    >
      {value}
    </button>
  );
}

/**
 * 快捷选择弹层：站点/驻站人/线路/车号
 * field=route 时支持 车队 -> 线路 两级浏览；有输入时始终模糊搜索全部线路。
 */
export default function StationPicker({
  open,
  field,
  onClose,
  onPick,
  stationNames = [],
  inspectorNames = [],
  routeNames = [],
  plateNames = [],
  fleets = [],
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState(null); // null | '__all__' | '__unassigned__' | 车队名

  useEffect(() => {
    if (open) {
      setQuery('');
      setView(null);
    }
  }, [open]);

  const title = useMemo(() => {
    if (view === '__all__') return '全部线路';
    if (view === '__unassigned__') return '未分类';
    if (view) return view;
    return field === 'station' ? '选择站点' : field === 'checker' ? '选择驻站人' : field === 'route' ? '选择线路' : '选择车号';
  }, [field, view]);

  if (!open) return null;

  const q = query.trim();
  const showFleetNav = field === 'route' && !q && !view;
  const routesInFleet = (name) =>
    name === '__all__'
      ? routeNames
      : name === '__unassigned__'
        ? routeNames.filter((r) => !fleets.some((f) => f.routes.includes(r)))
        : (fleets.find((f) => f.name === name)?.routes || []).filter((r) => routeNames.includes(r));

  let items = [];
  if (field === 'route') {
    items = search(showFleetNav ? [] : view ? routesInFleet(view) : routeNames, q, 50).map((m) => m.value);
  } else {
    const list = field === 'station' ? stationNames : field === 'checker' ? inspectorNames : plateNames;
    items = search(list, q, 50).map((m) => m.value);
  }

  const apply = (v) => {
    if (v) onPick(v);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-3">
        <div className="relative">
          <Icon name="search" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply(query.trim());
              }
            }}
            placeholder={field === 'route' ? '搜索线路（支持拼音）…' : '输入或搜索（支持拼音）…'}
            className="pl-9"
          />
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {showFleetNav ? (
            <>
              <GroupItem label="全部线路" count={routeNames.length} onClick={() => setView('__all__')} />
              {fleets.map((f) => (
                <GroupItem key={f.name} label={f.name} count={f.routes.length} onClick={() => setView(f.name)} />
              ))}
              {routesInFleet('__unassigned__').length > 0 && (
                <GroupItem label="未分类" count={routesInFleet('__unassigned__').length} onClick={() => setView('__unassigned__')} />
              )}
            </>
          ) : items.length ? (
            items.map((v) => <ItemButton key={v} value={v} onClick={apply} />)
          ) : (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              没有匹配项，可直接在上方输入后点「使用输入内容」
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {view && (
            <Button variant="outline" size="sm" onClick={() => setView(null)}>
              <Icon name="chevronLeft" className="size-4" />
              车队列表
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { onPick(''); onClose(); }}>
            清空
          </Button>
          <Button size="sm" className="flex-1" onClick={() => apply(query.trim())}>
            使用输入内容
          </Button>
        </div>
      </div>
    </Modal>
  );
}
