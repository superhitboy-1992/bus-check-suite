import { describe, expect, it, vi } from 'vitest';
import { handleLiveRequest } from '../tools/live-dev-proxy.js';

function etaRequest(body) {
  return new Request('http://192.168.1.5:5173/api/bus/eta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function upstreamResponse(payload, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(payload) };
}

const etaBody = { lineName: '莲张专线', stopName: '德贤路中侨大学', stopId: '21', direction: '0' };

describe('本地预览的同源转发', () => {
  it('不处理的路径返回 null（交回 Vite 自己处理）', async () => {
    expect(await handleLiveRequest(new Request('http://localhost:5173/index.html'))).toBeNull();
    expect(await handleLiveRequest(new Request('http://localhost:5173/api/bus/unknown'))).toBeNull();
  });

  it('/api/health 报告上游地址与城市', async () => {
    const res = await handleLiveRequest(new Request('http://localhost:5173/api/health'));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, upstream: 'https://api.shmaas.net', city: '310100' });
  });

  it('转发到站查询并归一化成前端契约（服务端请求不带 Origin）', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://api.shmaas.net/traffic/v1/getbusstoparrivedetails');
      expect(init.headers['X-Saic-CityCode']).toBe('310100');
      expect(JSON.parse(init.body)).toEqual(etaBody);
      return upstreamResponse({
        errCode: 0,
        now: 1789401850001,
        data: {
          stopArriveInfo: {
            currentLicensePlate: '沪A-53935D',
            currentBusStopCount: '2',
            currentBusDistance: '996',
            currentBusArriveTime: '2',
          },
          dispatchCarSchedule: { scheduleMsgShort: '', dispatchCars: [] },
        },
      });
    });

    const res = await handleLiveRequest(etaRequest(etaBody), { fetchImpl });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.status).toBe('running');
    expect(payload.buses[0]).toMatchObject({ plate: '沪A-53935D', stopsAway: 2, distanceMeters: 996, etaMinutes: 2 });
  });

  it('缺少参数返回 400，上游异常返回 502', async () => {
    const missing = await handleLiveRequest(etaRequest({ lineName: '莲张专线' }), { fetchImpl: vi.fn() });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe('bad_request');

    const failed = await handleLiveRequest(etaRequest(etaBody), {
      fetchImpl: vi.fn(async () => upstreamResponse({ errCode: 500, errMsg: '系统繁忙' })),
    });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ error: 'upstream_error', error_msg: '系统繁忙' });
  });
});
