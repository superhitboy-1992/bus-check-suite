/* 驻站实时到站：面板展开时按刷新间隔轮询，
   收起或页面不可见时停止；单条线路失败只影响那一行。 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isLiveConfigured, useLiveConfig } from './config';
import { buildLineMapIndex, findStops, loadLineMap } from './lineMap';
import { routesServingStation } from './stationRoutes';
import { DEFAULT_ETA_CACHE_TTL_MS, createTtlCache, loadArrivalRows } from './eta';
import { LiveError } from './client';

// 模块级缓存：面板收起后再打开、或切到别的站点再切回来都能命中
const etaCache = createTtlCache({ ttlMs: DEFAULT_ETA_CACHE_TTL_MS });

export function clearLiveCache() {
  etaCache.clear();
}

export const LIVE_PHASE = {
  IDLE: 'idle',
  UNCONFIGURED: 'unconfigured',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
};

/**
 * @param {object} options
 * @param {string} options.stationName 当前驻站站点
 * @param {Array} options.stations 基础数据站点（用于反查经过线路）
 * @param {boolean} options.expanded 面板是否展开
 */
export function useStationLive({ stationName, stations, expanded }) {
  const config = useLiveConfig();
  const configured = isLiveConfigured(config);
  const routeNames = useMemo(
    () => (expanded && stationName ? routesServingStation(stations, stationName) : []),
    [stations, stationName, expanded]
  );
  const routeKey = routeNames.join('|');
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({
    phase: LIVE_PHASE.IDLE,
    rows: [],
    unmapped: [],
    updatedAt: 0,
    error: null,
  });

  useEffect(() => {
    if (!expanded || !stationName) return undefined;
    if (!configured) {
      setState((s) => ({ ...s, phase: LIVE_PHASE.UNCONFIGURED, error: null }));
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    let mapIndex = null;

    const run = async () => {
      try {
        if (!mapIndex) {
          let map;
          try {
            map = await loadLineMap();
          } catch (e) {
            throw new LiveError('line_map_unavailable', String((e && e.message) || e));
          }
          if (cancelled) return;
          mapIndex = buildLineMapIndex(map);
        }
        const tasks = [];
        const unmapped = [];
        routeNames.forEach((routeName) => {
          const stops = findStops(mapIndex, routeName, stationName);
          if (!stops.length) {
            unmapped.push(routeName);
            return;
          }
          stops.forEach((stop) => {
            tasks.push({
              routeName,
              upDown: stop.upDown,
              toward: stop.toward,
              stopName: stop.apiName || stationName,
              stopId: stop.stopId,
            });
          });
        });

        if (!tasks.length) {
          setState({ phase: LIVE_PHASE.EMPTY, rows: [], unmapped, updatedAt: Date.now(), error: null });
          return;
        }

        const rows = await loadArrivalRows({
          proxyBaseUrl: config.proxyBaseUrl,
          tasks,
          cache: etaCache,
          signal: controller.signal,
        });
        if (cancelled) return;
        const allFailed = rows.length > 0 && rows.every((r) => r.status === 'error');
        const allStale = rows.length > 0 && rows.every((r) => r.stale);
        setState({
          phase: allFailed || allStale ? LIVE_PHASE.ERROR : LIVE_PHASE.READY,
          rows,
          unmapped,
          updatedAt: Date.now(),
          error: allFailed || allStale ? rows[0].error : null,
        });
      } catch (e) {
        if (cancelled || (e && e.code === 'aborted')) return;
        // 失败时保留上一轮数据，只更新错误信息
        setState((s) => ({
          ...s,
          phase: s.rows.length ? LIVE_PHASE.READY : LIVE_PHASE.ERROR,
          error: e,
        }));
      }
    };

    run();

    const seconds = Number(config.refreshSeconds) || 0;
    const timer =
      seconds > 0
        ? setInterval(() => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') run();
          }, seconds * 1000)
        : null;

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') run();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [expanded, stationName, configured, config.proxyBaseUrl, config.refreshSeconds, routeKey, nonce]);

  const refresh = useCallback(() => {
    etaCache.clear();
    setNonce((n) => n + 1);
  }, []);

  return {
    ...state,
    routeNames,
    configured,
    enabled: config.enabled,
    refreshSeconds: config.refreshSeconds,
    refresh,
  };
}
