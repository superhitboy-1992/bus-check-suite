import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { canonicalPath } from '../netlify/functions/live-proxy.mjs';

function upstreamJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

const etaBody = { lineName: '莲张专线', stopName: '德贤路中侨大学', stopId: '21', direction: '0' };

function etaRequest(url, body = etaBody) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Netlify 同源转发函数', () => {
  it('两种路径写法都还原成 /api/...', () => {
    expect(canonicalPath('/api/bus/eta')).toBe('/api/bus/eta');
    expect(canonicalPath('/.netlify/functions/live-proxy/bus/eta')).toBe('/api/bus/eta');
    expect(canonicalPath('/.netlify/functions/live-proxy/health')).toBe('/api/health');
  });

  it('/api/health 走通（应用可用性自检）', async () => {
    const res = await handler(new Request('https://bus.netlify.app/api/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, upstream: 'https://api.shmaas.net' });
  });

  it('经 redirect 的 /api/bus/eta 返回归一化到站数据', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://api.shmaas.net/traffic/v1/getbusstoparrivedetails');
      expect(init.headers['X-Saic-CityCode']).toBe('310100');
      expect(JSON.parse(init.body)).toEqual(etaBody);
      return upstreamJson({
        errCode: 0,
        now: 1789401850001,
        data: {
          stopArriveInfo: {
            currentLicensePlate: '沪A-53935D',
            currentBusStopCount: '2',
            currentBusDistance: '996',
            currentBusArriveTime: '2',
          },
          dispatchCarSchedule: { scheduleMsg: '', dispatchCars: [] },
        },
      });
    });
    globalThis.fetch = fetchMock;

    const res = await handler(etaRequest('https://bus.netlify.app/.netlify/functions/live-proxy/bus/eta'));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.status).toBe('running');
    expect(payload.buses[0]).toMatchObject({ plate: '沪A-53935D', stopsAway: 2, etaMinutes: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('缺少参数返回 400', async () => {
    const res = await handler(etaRequest('https://bus.netlify.app/api/bus/eta', { lineName: '莲张专线' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_request');
  });

  it('站点自身来源（同源 POST 也带 Origin）在白名单内，不被拦', async () => {
    globalThis.fetch = vi.fn(async () =>
      upstreamJson({
        errCode: 0,
        now: 1789401850001,
        data: {
          stopArriveInfo: { currentLicensePlate: '沪A-53935D', currentBusStopCount: '2' },
          dispatchCarSchedule: {},
        },
      })
    );
    const res = await handler(
      new Request('https://friendly-lily-0cb4b5.netlify.app/api/bus/eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://friendly-lily-0cb4b5.netlify.app' },
        body: JSON.stringify(etaBody),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'running' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://friendly-lily-0cb4b5.netlify.app');
  });

  it('白名单放行 GitHub Pages 来源（Pages 版也能直接用这个函数）', async () => {
    globalThis.fetch = vi.fn(async () =>
      upstreamJson({ errCode: 0, now: 1, data: { stopArriveInfo: {}, dispatchCarSchedule: {} } })
    );
    const res = await handler(
      new Request('https://friendly-lily-0cb4b5.netlify.app/api/bus/eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://superhitboy-1992.github.io' },
        body: JSON.stringify(etaBody),
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://superhitboy-1992.github.io');
  });
});
