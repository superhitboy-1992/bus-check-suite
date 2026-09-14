/* 基础数据 → 实时数据源：配置代理地址、刷新间隔与开关，并做连通性自检。 */
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Spinner, toast } from '../components/ui';
import { Icon } from '../components/icons';
import { REFRESH_OPTIONS, useLiveConfig, setLiveConfig } from '../lib/live/config';
import { LIVE_ERROR_TEXT, checkHealth, liveErrorText } from '../lib/live/client';
import { loadLineMap, resetLineMapCache } from '../lib/live/lineMap';
import { clearLiveCache } from '../lib/live/useStationLive';

const WORKER_SAMPLE = 'https://bus-live-proxy.<你的账号>.workers.dev';

export default function LiveSourceSection() {
  const config = useLiveConfig();
  const [draft, setDraft] = useState(config.proxyBaseUrl);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [mapInfo, setMapInfo] = useState({ state: 'loading', updatedAt: '', total: 0, low: [] });

  useEffect(() => {
    setDraft(config.proxyBaseUrl);
  }, [config.proxyBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    loadLineMap()
      .then((map) => {
        if (cancelled) return;
        const routes = (map && Array.isArray(map.routes) ? map.routes : []).filter((r) => r && r.directions && r.directions.length);
        setMapInfo({
          state: 'ready',
          updatedAt: String((map && map.updatedAt) || ''),
          total: routes.length,
          low: routes
            .filter((r) => (r.bestRate || 0) < 0.7)
            .map((r) => `${r.routeName}(${Math.round((r.bestRate || 0) * 100)}%)`),
        });
      })
      .catch(() => {
        if (!cancelled) setMapInfo({ state: 'error', updatedAt: '', total: 0, low: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function save(patch) {
    const next = setLiveConfig(patch);
    clearLiveCache();
    setCheckResult(null);
    return next;
  }

  function commitProxy() {
    const value = draft.trim().replace(/\/+$/, '');
    if (value && !/^https?:\/\//i.test(value)) {
      toast('代理地址要以 http:// 或 https:// 开头', 'error');
      return;
    }
    save({ proxyBaseUrl: value });
    setDraft(value);
    toast(value ? '代理地址已保存' : '已清空代理地址');
  }

  async function runCheck() {
    const base = (draft.trim() || config.proxyBaseUrl).replace(/\/+$/, '');
    if (!base) {
      setCheckResult({ ok: false, message: '请先填写代理地址' });
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const health = await checkHealth(base, { timeoutMs: 8000 });
      setCheckResult({ ok: true, message: `连接正常（上游 ${health.upstream || '—'}，城市 ${health.city || '—'}）` });
    } catch (e) {
      setCheckResult({ ok: false, message: liveErrorText(e) });
    } finally {
      setChecking(false);
    }
  }

  async function reloadMap() {
    resetLineMapCache();
    setMapInfo((s) => ({ ...s, state: 'loading' }));
    try {
      const map = await loadLineMap({ force: true });
      const routes = (map && Array.isArray(map.routes) ? map.routes : []).filter((r) => r && r.directions && r.directions.length);
      setMapInfo({
        state: 'ready',
        updatedAt: String((map && map.updatedAt) || ''),
        total: routes.length,
        low: routes.filter((r) => (r.bestRate || 0) < 0.7).map((r) => `${r.routeName}(${Math.round((r.bestRate || 0) * 100)}%)`),
      });
      toast('站点映射已刷新');
    } catch {
      setMapInfo({ state: 'error', updatedAt: '', total: 0, low: [] });
      toast('站点映射加载失败', 'error');
    }
  }

  return (
    <Card>
      <div className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">实时数据源</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            驻站登记页的「本站实时到站」面板通过 Cloudflare Worker 代理读取随申行的公交到站数据
            （线路、车牌、还有几站、预计到站时间）。浏览器不能直连上游，所以要先部署代理，
            把地址填在下面。仓库里的 <code className="rounded bg-accent px-1">worker/README.md</code> 有部署步骤。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            数据源是随申行 App 使用的未公开接口，无文档、无服务承诺，可能随时变更；本功能只做工作检查辅助，
            且不影响登记、查询、导出等原有功能。
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span>
            <span className="text-sm font-medium text-foreground">启用实时到站</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">关闭后驻站页不显示该面板</span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={config.enabled}
            onChange={(e) => save({ enabled: e.target.checked })}
          />
        </label>

        <Field label="Worker 代理地址">
          <div className="flex flex-wrap gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitProxy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitProxy();
                }
              }}
              placeholder={WORKER_SAMPLE}
              className="min-w-[16rem] flex-1"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="outline" onClick={runCheck} disabled={checking}>
              {checking ? <Spinner className="size-4" /> : <Icon name="refresh" className="size-4" />}
              连通性自检
            </Button>
          </div>
        </Field>

        {checkResult && (
          <p className={`text-sm ${checkResult.ok ? 'text-emerald-700' : 'text-destructive'}`}>
            {checkResult.ok ? '✓ ' : '× '}
            {checkResult.message}
          </p>
        )}

        <Field label="刷新间隔">
          <select
            value={config.refreshSeconds}
            onChange={(e) => save({ refreshSeconds: Number(e.target.value) })}
            className="h-11 w-full max-w-xs rounded-md border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-primary"
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            面板展开时才刷新；收起或页面切到后台会停止。
          </p>
        </Field>

        <div className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">站点映射（line-map.json）</span>
            <Button size="sm" variant="outline" onClick={reloadMap}>
              <Icon name="refresh" className="size-4" />
              重新加载
            </Button>
          </div>
          {mapInfo.state === 'loading' ? (
            <p className="mt-2 text-sm text-muted-foreground">加载中…</p>
          ) : mapInfo.state === 'error' ? (
            <p className="mt-2 text-sm text-destructive">
              映射文件缺失或读取失败。请在有网络的环境运行 <code className="rounded bg-accent px-1">pnpm build:line-map</code> 生成
              public/line-map.json。
            </p>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>
                已映射 {mapInfo.total} 条线路
                {mapInfo.updatedAt ? ` · 生成于 ${mapInfo.updatedAt.slice(0, 10)}` : ''}
              </p>
              {mapInfo.low.length > 0 && (
                <p>匹配率偏低、建议人工校对：{mapInfo.low.join('、')}</p>
              )}
              <p>
                校对方式：把对应线路的 stopId 写进 <code className="rounded bg-accent px-1">tools/line-map.overrides.json</code>
                ，再运行 <code className="rounded bg-accent px-1">pnpm build:line-map --only 线路名</code>。
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          错误提示对照：{Object.entries(LIVE_ERROR_TEXT).map(([code, text]) => `${code}=${text}`).join('；')}
        </p>
      </div>
    </Card>
  );
}
