/* 基础数据 → 实时数据源：配置数据源（直连/代理）、刷新间隔与开关，并做连通性自检。 */
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, SegmentedTabs, Spinner, toast } from '../components/ui';
import { Icon } from '../components/icons';
import { LIVE_SOURCE_OPTIONS, REFRESH_OPTIONS, useLiveConfig, setLiveConfig } from '../lib/live/config';
import {
  LIVE_ERROR_TEXT,
  buildSources,
  checkSource,
  liveErrorText,
  sourceKey,
  sourceLabel,
} from '../lib/live/client';
import { loadLineMap, resetLineMapCache } from '../lib/live/lineMap';
import { clearLiveCache } from '../lib/live/useStationLive';

const WORKER_SAMPLE = 'https://bus-live-proxy.<你的账号>.workers.dev';

export default function LiveSourceSection() {
  const config = useLiveConfig();
  const [draft, setDraft] = useState(config.proxyBaseUrl);
  const [checks, setChecks] = useState(null);
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
    setChecks(null);
    return next;
  }

  function commitProxy() {
    const value = draft.trim().replace(/\/+$/, '');
    if (value && !/^https?:\/\//i.test(value)) {
      toast('代理地址要以 http:// 或 https:// 开头', 'error');
      return;
    }
    // 标记为「手动填写」，以后换内置默认值不会再覆盖它
    save({ proxyBaseUrl: value, proxyBaseUrlCustom: true });
    setDraft(value);
    toast(value ? '代理地址已保存' : '已清空代理地址');
  }

  const sourceChain = buildSources(config).map(sourceLabel).join(' → ');

  async function runCheck() {
    const base = draft.trim().replace(/\/+$/, '');
    const candidates = buildSources({ source: config.source, proxyBaseUrl: base || config.proxyBaseUrl });
    if (!candidates.length) {
      setChecks([{ key: 'none', label: '自建代理', state: 'fail', message: '请先填写代理地址' }]);
      return;
    }
    setChecks(candidates.map((s) => ({ key: sourceKey(s), label: sourceLabel(s), state: 'checking', message: '检测中…' })));
    const results = await Promise.all(
      candidates.map(async (source) => {
        const started = Date.now();
        try {
          const result = await checkSource(source, { timeoutMs: 8000 });
          return {
            key: sourceKey(source),
            label: sourceLabel(source),
            state: 'ok',
            message: `${result.detail}（用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒）`,
          };
        } catch (e) {
          return { key: sourceKey(source), label: sourceLabel(source), state: 'fail', message: liveErrorText(e) };
        }
      })
    );
    setChecks(results);
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
            驻站登记页的「本站实时到站」面板读取随申行的公交到站数据（线路、车牌、还有几站、预计到站时间）。
            默认「自动」：本机 localhost 打开时直连随申行；手机用局域网地址打开时，自动改走本机预览服务的
            同源转发；只有在线上部署（GitHub Pages 等）打开时，才需要用自建 Cloudflare Worker 代理
            （部署步骤见仓库里的{' '}
            <code className="rounded bg-accent px-1">worker/README.md</code>）。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            提示：随申行接口只放行 <code className="rounded bg-accent px-1">localhost</code> 作为跨域来源，
            所以局域网 IP、线上域名直连都会被拒；“自动”模式会依次尝试直连 → 同源转发 → 自建代理，
            点「连通性自检」可以看清哪条通。另外{' '}
            <code className="rounded bg-accent px-1">*.workers.dev</code> 在部分国内网络下会被 DNS 投毒、
            连接一直无响应（界面表现为“请求超时”），这类设备不要填代理地址。
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

        <Field label="数据源">
          <SegmentedTabs
            options={LIVE_SOURCE_OPTIONS}
            value={config.source}
            onChange={(value) => save({ source: value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {config.source === 'direct'
              ? '只用直连随申行：适合在本机 localhost 打开；上游不放行局域网 IP 与线上域名。'
              : config.source === 'proxy'
                ? '只用自建代理：线上部署（GitHub Pages 等）或直连、同源都不通时用。'
                : '依次尝试直连随申行 → 本机预览服务的同源转发 → 下面填的自建代理，第一次失败会自动换下一条。'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            当前实际链路：{sourceChain || '（没有可用数据源）'}
          </p>
        </Field>

        <Field label={config.source === 'direct' ? '自建代理地址（当前模式不使用）' : '自建代理地址（可选）'}>
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
            <Button variant="outline" onClick={runCheck} disabled={Boolean(checks && checks.some((c) => c.state === 'checking'))}>
              {checks && checks.some((c) => c.state === 'checking') ? (
                <Spinner className="size-4" />
              ) : (
                <Icon name="refresh" className="size-4" />
              )}
              连通性自检
            </Button>
          </div>
        </Field>

        {checks && (
          <ul className="space-y-1 text-sm">
            {checks.map((check) => (
              <li
                key={check.key}
                className={
                  check.state === 'ok'
                    ? 'text-emerald-700'
                    : check.state === 'fail'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }
              >
                {check.state === 'ok' ? '✓ ' : check.state === 'fail' ? '× ' : '… '}
                {check.label}：{check.message}
              </li>
            ))}
          </ul>
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
