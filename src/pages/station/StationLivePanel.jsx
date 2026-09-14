/* 驻站登记页的「本站实时到站」折叠面板：
   站点选定后列出经过本站的线路（按站名自动反查），上下行分开显示。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useBasicData } from '../../lib/storage';
import { LIVE_STATUS } from '../../lib/live/eta';
import { liveErrorText } from '../../lib/live/client';
import { LIVE_PHASE, useStationLive } from '../../lib/live/useStationLive';

export function formatEta(row) {
  const bus = row.first;
  if (!bus) return '';
  const stops = bus.stopsAway;
  if (stops !== null && stops <= 0) return '已到站';
  if (bus.etaMinutes !== null && bus.etaMinutes <= 0) return '即将到站';
  if (bus.etaMinutes !== null) return `约 ${bus.etaMinutes} 分钟`;
  if (stops !== null) return `还有 ${stops} 站`;
  return '';
}

export function formatStops(row) {
  const bus = row.first;
  if (!bus) return '';
  const parts = [];
  if (bus.stopsAway !== null && bus.stopsAway > 0) parts.push(`还有 ${bus.stopsAway} 站`);
  if (bus.distanceMeters !== null) {
    parts.push(bus.distanceMeters >= 1000 ? `${(bus.distanceMeters / 1000).toFixed(1)} 公里` : `${bus.distanceMeters} 米`);
  }
  return parts.join(' · ');
}

function formatClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function RowStatus({ row }) {
  if (row.status === LIVE_STATUS.RUNNING) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-emerald-700">{formatEta(row)}</p>
        <p className="text-xs text-muted-foreground">{formatStops(row)}</p>
      </div>
    );
  }
  if (row.status === LIVE_STATUS.WAITING) {
    const car = row.schedule.cars[0];
    return (
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-foreground">等待发车</p>
        <p className="text-xs text-muted-foreground">
          {car ? `下一班 ${car.vehicle ? car.vehicle + ' ' : ''}${car.time}${car.countdown ? `（约 ${car.countdown} 分钟）` : ''}` : '暂无发车计划'}
        </p>
      </div>
    );
  }
  if (row.status === LIVE_STATUS.CLOSED) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-muted-foreground">不在运营时间</p>
        {row.schedule.message && <p className="text-xs text-muted-foreground">{row.schedule.message}</p>}
      </div>
    );
  }
  return (
    <div className="shrink-0 text-right">
      <p className="text-sm font-medium text-destructive">获取失败</p>
      <p className="text-xs text-muted-foreground">{liveErrorText(row.error)}</p>
    </div>
  );
}

function LiveRow({ row }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">{row.routeName}</span>
          <Badge variant={row.upDown === 0 ? 'outline' : 'muted'}>{row.directionLabel}</Badge>
          {row.toward && <span className="truncate text-xs text-muted-foreground">往 {row.toward}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.first && row.first.plate ? row.first.plate : '—'}
          {row.first && row.first.accessible ? ' · 无障碍' : ''}
          {row.next && row.next.etaMinutes !== null ? ` · 下一班约 ${row.next.etaMinutes} 分钟` : ''}
          {row.stale ? ' · 上次数据' : ''}
        </p>
      </div>
      <RowStatus row={row} />
    </li>
  );
}

export default function StationLivePanel({ stationName }) {
  const basicData = useBasicData();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const live = useStationLive({
    stationName,
    stations: basicData.stations,
    expanded,
  });

  const runningCount = live.rows.filter((r) => r.status === LIVE_STATUS.RUNNING).length;
  const summary = !stationName
    ? '选择站点后可用'
    : !live.enabled
      ? '已关闭'
      : !live.configured
        ? '未配置数据源'
        : runningCount > 0
          ? `${runningCount} 条线路有车在途`
          : live.rows.length
            ? `${live.rows.length} 条线路`
            : '展开后查询';

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <Icon name="bus" className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">本站实时到站</span>
          <span className="text-xs text-muted-foreground">{summary}</span>
        </span>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} className="size-4 text-muted-foreground" />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {live.phase === LIVE_PHASE.UNCONFIGURED ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {live.enabled
                  ? '还没配置实时数据源。部署 Cloudflare Worker 代理后，把地址填进「基础数据 → 实时数据源」即可在这里看到车辆到站信息。'
                  : '实时到站已在「基础数据 → 实时数据源」里关闭。'}
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate('/basic-data', { state: { tab: 'live' } })}>
                {live.enabled ? '去配置数据源' : '去打开'}
              </Button>
            </div>
          ) : !stationName ? (
            <p className="text-sm text-muted-foreground">请先选择「驻站站名」。</p>
          ) : live.phase === LIVE_PHASE.EMPTY ? (
            <p className="text-sm text-muted-foreground">
              该站点没有匹配到实时数据（可能是新站或站名有变化），可在「基础数据 → 实时数据源」里查看映射情况。
            </p>
          ) : (
            <>
              {live.phase === LIVE_PHASE.ERROR && (
                <div className="mb-2 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">实时数据获取失败：{liveErrorText(live.error)}</span>
                    <span className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={live.refresh}>
                        重试
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate('/basic-data', { state: { tab: 'live' } })}
                      >
                        检查数据源
                      </Button>
                    </span>
                  </div>
                  {['timeout', 'network_error', 'upstream_unreachable', 'not_found', 'origin_not_allowed'].includes(
                    live.error?.code
                  ) && (
                    <p className="text-xs text-muted-foreground">
                      一直超时多半是网络把接口地址拦住了（例如 *.workers.dev 被 DNS 投毒），可在「基础数据 → 实时数据源」
                      里改用「直连随申行」或用「连通性自检」确认哪条路通。
                    </p>
                  )}
                </div>
              )}
              {live.rows.length === 0 ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  正在查询经过本站的线路…
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {live.rows.map((row) => (
                    <LiveRow key={row.key} row={row} />
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                <span>
                  {live.updatedAt ? `更新于 ${formatClock(live.updatedAt)}` : ''}
                  {live.refreshSeconds > 0 ? ` · 每 ${live.refreshSeconds} 秒自动刷新` : ' · 手动刷新'}
                </span>
                <Button size="sm" variant="ghost" onClick={live.refresh}>
                  <Icon name="refresh" className="size-4" />
                  刷新
                </Button>
              </div>
              {live.unmapped.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  未匹配到站点的线路：{live.unmapped.join('、')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
