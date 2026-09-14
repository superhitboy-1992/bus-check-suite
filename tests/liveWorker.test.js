import { describe, expect, it } from 'vitest';
import { hashString, normalizeEta, unwrapUpstream } from '../worker/index.js';

describe('上游响应解包', () => {
  it('取出 { errCode, data } 里的内层数据，本身已是内层时原样返回', () => {
    expect(unwrapUpstream({ errCode: 0, data: { busLine: { lineId: '1' } } })).toEqual({ busLine: { lineId: '1' } });
    expect(unwrapUpstream({ busLine: { lineId: '1' } })).toEqual({ busLine: { lineId: '1' } });
    expect(unwrapUpstream(null)).toEqual({});
  });

  it('带包装的实时响应也能正确归一化，并采用上游时间戳', () => {
    const result = normalizeEta(
      {
        errCode: 0,
        errMsg: '',
        now: 1789397977877,
        data: {
          stopArriveInfo: { currentLicensePlate: '沪A-13762A', currentBusStopCount: 2, currentBusArriveTime: 4 },
          dispatchCarSchedule: {},
        },
      }
    );
    expect(result.status).toBe('running');
    expect(result.buses[0]).toMatchObject({ plate: '沪A-13762A', stopsAway: 2, etaMinutes: 4 });
    expect(result.updatedAt).toBe(new Date(1789397977877).toISOString());
  });
});

describe('代理端到站数据归一化', () => {
  it('在途车辆：车牌 / 站点数 / 距离 / 分钟 / 无障碍', () => {
    const result = normalizeEta({
      stopArriveInfo: {
        currentBusDistance: '370',
        currentBusArriveTime: '2',
        currentBusStopCount: 1,
        currentLicensePlate: '沪A-13762A',
        currentBusGps: '121.380858,31.190582',
        currentBarrierFree: true,
        nextLicensePlate: '沪A-99999',
        nextBusStopCount: 5,
      },
      dispatchCarSchedule: { scheduleMsg: '', dispatchCars: [] },
    });
    expect(result.status).toBe('running');
    expect(result.buses).toHaveLength(2);
    expect(result.buses[0]).toMatchObject({
      plate: '沪A-13762A',
      stopsAway: 1,
      distanceMeters: 370,
      etaMinutes: 2,
      accessible: true,
      gps: '121.380858,31.190582',
    });
    expect(result.buses[1]).toMatchObject({ plate: '沪A-99999', stopsAway: 5 });
  });

  it('无在途车：有排班是 waiting，只有不在运营提示是 closed', () => {
    const idle = { currentBusComfort: 0, currentBusStopCount: 0, currentBarrierFree: false };
    expect(normalizeEta({ stopArriveInfo: idle, dispatchCarSchedule: {} }).status).toBe('waiting');

    const closed = normalizeEta({
      stopArriveInfo: idle,
      dispatchCarSchedule: { scheduleMsg: '不在运营时间', scheduleMsgShort: '预计04:40从首站发车' },
    });
    expect(closed.status).toBe('closed');
    expect(closed.schedule.message).toBe('预计04:40从首站发车');
  });

  it('发车班次带车辆与倒计时', () => {
    const result = normalizeEta({
      stopArriveInfo: {},
      dispatchCarSchedule: { dispatchCars: [{ vehicle: '沪A-1', time: '06:00', countdown: '12' }] },
    });
    expect(result.status).toBe('waiting');
    expect(result.schedule.cars[0]).toEqual({ vehicle: '沪A-1', time: '06:00', countdown: '12' });
  });

  it('空数据不抛异常', () => {
    expect(normalizeEta(null)).toMatchObject({ status: 'waiting', buses: [] });
  });
});

describe('缓存键指纹', () => {
  it('相同内容指纹相同、不同内容指纹不同', () => {
    expect(hashString('{"a":1}')).toBe(hashString('{"a":1}'));
    expect(hashString('{"a":1}')).not.toBe(hashString('{"a":2}'));
  });
});
