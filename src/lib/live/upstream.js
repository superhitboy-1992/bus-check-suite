/* 随申行（上海 MaaS）上游接口契约：地址、路径与响应归一化。

   这份代码同时被前端「直连」模式和 worker/ 代理使用，
   两边共用一份，避免归一化逻辑漂移。这里只做纯数据处理，不发请求。 */

export const UPSTREAM_BASE = 'https://api.shmaas.net';
export const UPSTREAM_CITY_CODE = '310100';

export const UPSTREAM_PATHS = {
  search: '/traffic/v2/querytrafficline',
  detail: '/traffic/v1/querybusline',
  eta: '/traffic/v1/getbusstoparrivedetails',
};

/** 上游统一是 { errCode, errMsg, data } 包装，这里取出内层业务数据 */
export function unwrapUpstream(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload && typeof payload === 'object' ? payload : {};
}

/** 上游业务错误 → { code, message }；一切正常时返回 null */
export function upstreamError(payload) {
  if (!payload || typeof payload !== 'object') return { code: 'upstream_error', message: '上游返回空数据' };
  if (payload.errCode !== undefined && payload.errCode !== 0) {
    return { code: 'upstream_error', message: String(payload.errMsg || '上游返回异常') };
  }
  return null;
}

export function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 上游到站原始数据 → 前端统一契约 */
export function normalizeEta(payload, upstreamNow) {
  const data = unwrapUpstream(payload);
  const nowMs = Number.isFinite(Number(upstreamNow)) ? Number(upstreamNow) : Number(payload && payload.now);
  const info = (data && data.stopArriveInfo) || {};
  const schedule = (data && data.dispatchCarSchedule) || {};
  const buses = [];

  const pushBus = (prefix) => {
    // 上游字段名是 currentLicensePlate / nextLicensePlate，
    // 兼容个别版本里出现的 currentLicensePlat 写法
    const rawPlate = info[`${prefix}LicensePlate`] !== undefined ? info[`${prefix}LicensePlate`] : info[`${prefix}LicensePlat`];
    const plate = rawPlate !== undefined && rawPlate !== null ? String(rawPlate).trim() : '';
    const stopsAway = toNumber(info[`${prefix}BusStopCount`]);
    const distanceMeters = toNumber(info[`${prefix}BusDistance`]);
    const etaMinutes = toNumber(info[`${prefix}BusArriveTime`]);
    const running = Boolean(plate) || (stopsAway !== null && stopsAway > 0) || etaMinutes !== null;
    if (!running) return;
    buses.push({
      plate,
      stopsAway: stopsAway === null ? null : Math.max(0, stopsAway),
      distanceMeters,
      etaMinutes,
      accessible: Boolean(prefix === 'current' ? info.currentBarrierFree : info.nextBarrierFree) || /无障碍/.test(plate),
      gps: prefix === 'current' && info.currentBusGps ? String(info.currentBusGps) : '',
    });
  };

  pushBus('current');
  pushBus('next');

  const cars = (Array.isArray(schedule.dispatchCars) ? schedule.dispatchCars : [])
    .map((car) => ({
      vehicle: car && car.vehicle ? String(car.vehicle) : '',
      time: car && car.time ? String(car.time) : '',
      countdown: car && car.countdown !== undefined && car.countdown !== null ? String(car.countdown) : '',
    }))
    .filter((car) => car.vehicle || car.time);

  const message = String(schedule.scheduleMsgShort || schedule.scheduleMsg || '').trim();
  const status = buses.length ? 'running' : cars.length || !message ? 'waiting' : 'closed';

  return {
    status,
    buses,
    schedule: { message, cars },
    updatedAt: new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString(),
  };
}

/** 请求体指纹（FNV-1a 32 位），用于区分不同站点的缓存条目 */
export function hashString(value) {
  let h = 0x811c9dc5;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
