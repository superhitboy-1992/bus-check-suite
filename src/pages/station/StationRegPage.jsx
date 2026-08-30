import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import StationTabs from './StationTabs';
import StationPicker from './StationPicker';
import { RESULT_PRESETS, TICK_SEQ, TICK_LABEL } from '../../lib/constants';
import { todayStr, nowTime, normalizePlate, validRecord } from '../../lib/stationCore';
import {
  createStationRecord,
  deleteStationRecord,
  getStationLast,
  getStationRecords,
  getStationReminder,
  learnStationValues,
  saveStationLast,
  saveStationReminder,
  updateStationRecord,
  useBasicData,
  useStationRecords,
} from '../../lib/storage';

const FIELD_ORDER = ['f-station', 'f-checker', 'f-date', 'f-time', 'f-route', 'f-plate', 'f-boarding', 'f-result', 'f-rectify', 'f-remark'];

function TickButton({ value, onClick }) {
  const label = TICK_LABEL[value] || '留空';
  const tone = value === '√' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : value === '×' ? 'bg-red-100 text-red-700 border-red-300' : 'border-border';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 w-full rounded-md border px-3 text-base font-medium transition-colors md:text-sm ${tone}`}
    >
      {label}
    </button>
  );
}

export default function StationRegPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const basicData = useBasicData();
  const stationRecords = useStationRecords();

  const [fixed, setFixed] = useState(() => {
    const last = getStationLast();
    return { station: last.station || '', checker: last.checker || '', date: last.date || todayStr() };
  });
  const [time, setTime] = useState('');
  const [route, setRoute] = useState('');
  const [plate, setPlate] = useState('');
  const [boarding, setBoarding] = useState('0');
  const [normTick, setNormTick] = useState('');
  const [callTick, setCallTick] = useState('');
  const [checkResult, setCheckResult] = useState('');
  const [rectification, setRectification] = useState('');
  const [remark, setRemark] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [picker, setPicker] = useState(null); // 'station'|'checker'|'route'|'plate'
  const [reminder, setReminder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const formRef = useRef(null);
  const fieldRefs = useRef({});

  const stationNames = useMemo(() => {
    const seen = new Set();
    const out = [];
    basicData.stations.forEach((s) => {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        out.push(s.name);
      }
    });
    return out;
  }, [basicData.stations]);
  const inspectorNames = basicData.inspectors;
  const routeNames = basicData.routes.map((r) => r.name);
  const plateNames = basicData.plates;
  const fleets = basicData.fleets.map((name) => ({
    name,
    routes: basicData.routes.filter((r) => r.fleet === name).map((r) => r.name),
  }));

  const today = todayStr();
  const todayCount = stationRecords.filter((r) => r.date === today).length;
  const dayCount = new Set(stationRecords.map((r) => r.date).filter(Boolean)).size;

  useEffect(() => {
    if (!location.state?.editId) return;
    const rec = getStationRecords().find((r) => r.id === location.state.editId);
    if (!rec) return;
    setFixed({ station: rec.station || '', checker: rec.checker || '', date: rec.date || todayStr() });
    setTime(rec.time || '');
    setRoute(rec.route || '');
    setPlate(rec.plate || '');
    setBoarding(rec.boarding === '' || rec.boarding === null || rec.boarding === undefined ? '0' : String(rec.boarding));
    setNormTick(rec.stationNorms || '');
    setCallTick(rec.conductorCall || '');
    setCheckResult(rec.checkResult || '');
    setRectification(rec.rectification || '');
    setRemark(rec.remark || '');
    setEditingId(rec.id);
  }, [location.state?.editId]);

  useEffect(() => {
    checkReminder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationRecords.length]);

  function checkReminder() {
    const reminderData = getStationReminder();
    const total = getStationRecords().length;
    let show = false;
    let msg = '';
    if (reminderData.lastBackupAt) {
      const newCount = total - (reminderData.lastBackupCount || 0);
      const days = (Date.now() - reminderData.lastBackupAt) / 86400000;
      if (newCount >= 50) {
        show = true;
        msg = `已有 ${newCount} 条新记录未备份，建议立即导出 JSON 备份。`;
      } else if (days >= 7) {
        show = true;
        msg = `距上次备份已 ${Math.floor(days)} 天，建议导出 JSON 备份。`;
      }
    } else if (total >= 20) {
      show = true;
      msg = `已登记 ${total} 条记录，建议先导出一次备份。`;
    }
    setReminder(show ? { msg } : null);
  }

  function resetVehicle() {
    setTime('');
    setRoute('');
    setPlate('');
    setBoarding('0');
    setNormTick('');
    setCallTick('');
    setCheckResult('');
    setRectification('');
    setRemark('');
  }

  function startNewCheck() {
    setFixed({ station: '', checker: '', date: todayStr() });
    setEditingId(null);
    resetVehicle();
    saveStationLast({ station: '', checker: '', date: '' });
    toast('已开始新检查，请填写站点、驻站人、日期');
  }

  function cycleTick(key) {
    const cur = key === 'norm' ? normTick : callTick;
    const next = TICK_SEQ[(TICK_SEQ.indexOf(cur) + 1) % TICK_SEQ.length];
    if (key === 'norm') setNormTick(next);
    else setCallTick(next);
  }

  function bumpBoarding(delta) {
    const v = parseInt(boarding, 10);
    const next = Math.max(0, (isNaN(v) ? 0 : v) + delta);
    setBoarding(String(next));
  }

  function handlePlateBlur() {
    const v = normalizePlate(plate);
    if (v !== plate) {
      setPlate(v);
      if (!time && v) setTime(nowTime());
    } else if (!time && v) {
      setTime(nowTime());
    }
  }

  function handleSave(e) {
    e.preventDefault();
    const rec = {
      station: fixed.station.trim(),
      checker: fixed.checker.trim(),
      date: fixed.date,
      time: time.trim(),
      route: route.trim(),
      plate: normalizePlate(plate),
      boarding: boarding === '' ? '0' : boarding,
      stationNorms: normTick,
      conductorCall: callTick,
      checkResult: checkResult.trim(),
      rectification: rectification.trim(),
      remark: remark.trim(),
    };
    if (!validRecord(rec)) {
      toast('请填写：站点、驻站人、日期、线路、车号', 'error');
      return;
    }
    if (editingId) {
      updateStationRecord(editingId, rec);
      setEditingId(null);
      toast('修改已保存');
    } else {
      createStationRecord(rec);
      toast('已保存，可继续登记下一辆');
    }
    learnStationValues(rec);
    saveStationLast({ station: rec.station, checker: rec.checker, date: rec.date });
    resetVehicle();
    checkReminder();
  }

  function cancelEdit() {
    setEditingId(null);
    setFixed({ station: '', checker: '', date: todayStr() });
    resetVehicle();
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteStationRecord(deleteTarget);
      toast('已删除');
    }
    setDeleteTarget(null);
    if (editingId === deleteTarget) {
      setEditingId(null);
      resetVehicle();
    }
  }

  function onKeyDownEnter(e, id, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (id === 'f-plate' || i >= FIELD_ORDER.length - 1) {
      formRef.current?.requestSubmit();
    } else {
      fieldRefs.current[FIELD_ORDER[i + 1]]?.focus();
    }
  }

  function focusRef(id) {
    return (el) => {
      fieldRefs.current[id] = el;
    };
  }

  return (
    <div className="space-y-4">
      <StationTabs />

      {reminder && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{reminder.msg}</span>
          <span className="flex gap-2">
            <Button size="sm" onClick={() => navigate('/basic-data', { state: { tab: 'backup' } })}>
              去备份
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReminder(null)}>
              稍后
            </Button>
          </span>
        </div>
      )}

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: '今日记录', value: todayCount },
          { label: '全部记录', value: stationRecords.length },
          { label: '涉及天数', value: dayCount },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </section>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{editingId ? '编辑记录' : '登记新记录'}</h2>
          {editingId && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">正在编辑</span>}
        </div>
        <form ref={formRef} onSubmit={handleSave} autoComplete="off" className="space-y-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">本次检查信息</h3>
              <Button type="button" size="sm" variant="outline" onClick={startNewCheck}>
                开始新检查
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">站点、驻站人、日期为本次检查的固定信息，登记多辆车时保持不变。</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="驻站站名 *">
                <div className="flex gap-1.5">
                  <Input
                    ref={focusRef('f-station')}
                    value={fixed.station}
                    onChange={(e) => setFixed({ ...fixed, station: e.target.value })}
                    onFocus={() => setPicker('station')}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-station', 0)}
                    placeholder="如：汽车站"
                  />
                  <Button type="button" variant="outline" onClick={() => setPicker('station')} aria-label="选择站点">
                    ▾
                  </Button>
                </div>
              </Field>
              <Field label="驻站人 *">
                <div className="flex gap-1.5">
                  <Input
                    ref={focusRef('f-checker')}
                    value={fixed.checker}
                    onChange={(e) => setFixed({ ...fixed, checker: e.target.value })}
                    onFocus={() => setPicker('checker')}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-checker', 1)}
                    placeholder="检查人姓名"
                  />
                  <Button type="button" variant="outline" onClick={() => setPicker('checker')} aria-label="选择驻站人">
                    ▾
                  </Button>
                </div>
              </Field>
              <Field label="日期 *">
                <Input
                  ref={focusRef('f-date')}
                  type="date"
                  value={fixed.date}
                  onChange={(e) => setFixed({ ...fixed, date: e.target.value })}
                  onKeyDown={(e) => onKeyDownEnter(e, 'f-date', 2)}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">车辆登记信息</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="过站时间 *">
                <div className="flex gap-1.5">
                  <Input
                    ref={focusRef('f-time')}
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-time', 3)}
                  />
                  <Button type="button" variant="outline" onClick={() => setTime(nowTime())} aria-label="登记当前时间">
                    现在
                  </Button>
                </div>
              </Field>
              <Field label="线路 *">
                <div className="flex gap-1.5">
                  <Input
                    ref={focusRef('f-route')}
                    value={route}
                    onChange={(e) => setRoute(e.target.value)}
                    onFocus={() => setPicker('route')}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-route', 4)}
                    placeholder="如：莲朱专线"
                  />
                  <Button type="button" variant="outline" onClick={() => setPicker('route')} aria-label="选择线路">
                    ▾
                  </Button>
                </div>
              </Field>
              <Field label="车号 *">
                <div className="flex gap-1.5">
                  <Input
                    ref={focusRef('f-plate')}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    onFocus={() => setPicker('plate')}
                    onBlur={handlePlateBlur}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-plate', 5)}
                    placeholder="如：沪A36401D"
                  />
                  <Button type="button" variant="outline" onClick={() => setPicker('plate')} aria-label="选择车号">
                    ▾
                  </Button>
                </div>
              </Field>
              <Field label="上客人数">
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" onClick={() => bumpBoarding(-1)} aria-label="减少人数">
                    −
                  </Button>
                  <Input
                    ref={focusRef('f-boarding')}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={boarding}
                    onChange={(e) => setBoarding(e.target.value)}
                    onKeyDown={(e) => onKeyDownEnter(e, 'f-boarding', 6)}
                    className="text-center"
                  />
                  <Button type="button" variant="outline" onClick={() => bumpBoarding(1)} aria-label="增加人数">
                    +
                  </Button>
                </div>
              </Field>
              <Field label="进出站规范">
                <TickButton value={normTick} onClick={() => cycleTick('norm')} />
              </Field>
              <Field label="售票员招呼">
                <TickButton value={callTick} onClick={() => cycleTick('call')} />
              </Field>
              <Field label="检查情况" className="sm:col-span-3">
                <Input
                  ref={focusRef('f-result')}
                  value={checkResult}
                  onChange={(e) => setCheckResult(e.target.value)}
                  onKeyDown={(e) => onKeyDownEnter(e, 'f-result', 7)}
                  placeholder="文字描述，可留空"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RESULT_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCheckResult(checkResult === v ? '' : v)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        checkResult === v
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="整改措施">
                <Input
                  ref={focusRef('f-rectify')}
                  value={rectification}
                  onChange={(e) => setRectification(e.target.value)}
                  onKeyDown={(e) => onKeyDownEnter(e, 'f-rectify', 8)}
                  placeholder="如：已当场整改，可留空"
                />
              </Field>
              <Field label="备注">
                <Input
                  ref={focusRef('f-remark')}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  onKeyDown={(e) => onKeyDownEnter(e, 'f-remark', 9)}
                  placeholder="其他需要说明的事项，可留空"
                />
              </Field>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button type="submit" size="lg" className="flex-1">
              {editingId ? '保存修改' : '保存记录'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                取消编辑
              </Button>
            )}
            {editingId && (
              <Button type="button" variant="ghost" className="text-xs" onClick={() => setDeleteTarget(editingId)}>
                删除此条
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            保存后自动清空车辆信息，可继续登记下一辆；站点、驻站人、日期为本次检查固定信息，换站时点「开始新检查」。
          </p>
        </form>
      </Card>

      <StationPicker
        open={Boolean(picker)}
        field={picker}
        onClose={() => setPicker(null)}
        onPick={(v) => {
          if (picker === 'station') setFixed({ ...fixed, station: v });
          else if (picker === 'checker') setFixed({ ...fixed, checker: v });
          else if (picker === 'route') setRoute(v);
          else if (picker === 'plate') {
            const p = normalizePlate(v);
            setPlate(p);
            if (p && !time) setTime(nowTime());
          }
          setPicker(null);
        }}
        stationNames={stationNames}
        inspectorNames={inspectorNames}
        routeNames={routeNames}
        plateNames={plateNames}
        fleets={fleets}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">删除记录</h2>
            <p className="mt-2 text-sm text-muted-foreground">确定删除这条记录吗？此操作不可恢复。</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="database" className="size-3.5" />
        线路、站点、车号、驻站人支持汉字或拼音模糊匹配；资料可在「基础数据」统一维护。
      </p>
    </div>
  );
}
