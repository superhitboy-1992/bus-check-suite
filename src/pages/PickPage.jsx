import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PICK_FIELDS } from '../lib/constants';
import { useBasicData } from '../lib/storage';
import { Icon } from '../components/icons';
import { Button, Input } from '../components/ui';

export default function PickPage() {
  const { field } = useParams();
  const navigate = useNavigate();
  const basicData = useBasicData();
  const [query, setQuery] = useState('');
  const conf = field ? PICK_FIELDS[field] : null;
  const pickRouteName = sessionStorage.getItem('pickRouteName') || '';
  const needsRoute = conf?.type === 'station';

  const items = useMemo(() => {
    if (!conf) return [];
    let list = [];
    if (conf.type === 'route') list = basicData.routes;
    else if (conf.type === 'driver') list = basicData.drivers;
    else if (conf.type === 'conductor') list = basicData.conductors;
    else
      list = basicData.stations
        .filter((s) => s.routeName === pickRouteName)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return list;
    return list.filter((it) => it.name.toLowerCase().replace(/\s+/g, '').includes(q));
  }, [conf, basicData, pickRouteName, query]);

  const pick = (item) => {
    if (!field) return;
    sessionStorage.setItem('pickResult', JSON.stringify({ field, value: item.name }));
    navigate(-1);
  };

  return (
    <div className="min-h-[60vh]">
      <div className="mb-4 flex items-center gap-3 px-1">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="arrowLeft" className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{conf?.title || '选择'}</h1>
      </div>

      <div className="mb-3">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称"
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {needsRoute && !pickRouteName ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-base font-medium">请先选择线路</p>
            <p className="text-sm text-muted-foreground">返回上一页选择线路后再进行此操作</p>
            <Button variant="outline" className="mt-2" onClick={() => navigate(-1)}>
              返回
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-base font-medium">{query.trim() ? '无匹配结果' : '暂无数据'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.trim() ? '换个关键字试试' : '当前条件下没有可选项'}
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              共 {items.length} 项
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className="flex w-full items-center justify-between border-b border-border p-4 text-left transition-colors last:border-b-0 hover:bg-accent/50 active:bg-accent/70"
                  >
                    <span className="truncate text-base font-medium">{item.name}</span>
                    <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
