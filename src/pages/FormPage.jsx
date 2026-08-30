import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CHECK_ITEMS, emptyItems } from '../lib/constants';
import {
  addInspector,
  clearDraft,
  createRecord,
  getDraft,
  getInspectorHistory,
  getRecords,
  saveDraft,
  updateRecord,
} from '../lib/storage';
import { todayStr } from '../lib/dates';
import { Icon } from '../components/icons';
import { Button, Card, Field, Input, Modal, Textarea, toast } from '../components/ui';

function isDraftEmpty(p) {
  return (
    !p.route &&
    !p.plateNumber &&
    !p.driver &&
    !p.conductor &&
    !p.boardTime &&
    !p.boardLocation &&
    !p.alightTime &&
    !p.alightLocation &&
    !p.remark &&
    !p.inspector &&
    p.inspectionDate === todayStr() &&
    !Object.values(p.items || {}).some(Boolean)
  );
}

function ItemToggle({ item, value, onChange }) {
  const set = (status) => {
    onChange(value === status ? null : status);
  };
  return (
    <div className="flex shrink-0 items-stretch">
      <button
        type="button"
        aria-label={`${item.name}合格`}
        onClick={() => set('pass')}
        className={`h-11 w-11 rounded-l-lg border text-white transition-colors active:scale-95 ${
          value === 'pass'
            ? 'border-[hsl(145_65%_42%)] bg-[hsl(145_65%_42%)]'
            : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
        }`}
      >
        <Icon name="check" className="mx-auto size-5" />
      </button>
      <button
        type="button"
        aria-label={`${item.name}不合格`}
        onClick={() => set('fail')}
        className={`h-11 w-11 border-l-0 border text-white transition-colors active:scale-95 ${
          value === 'fail'
            ? 'border-[hsl(0_72%_51%)] bg-[hsl(0_72%_51%)]'
            : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
        }`}
      >
        <Icon name="x" className="mx-auto size-5" />
      </button>
      <button
        type="button"
        aria-label={`${item.name}待确认`}
        onClick={() => set(null)}
        className={`h-11 w-11 rounded-r-lg border-l-0 border transition-colors active:scale-95 ${
          value === null
            ? 'border-border bg-accent text-muted-foreground'
            : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
        }`}
      >
        <Icon name="question" className="mx-auto size-4" />
      </button>
    </div>
  );
}

function PickInput({ value, placeholder, onClick, readOnly = true }) {
  return (
    <div className="relative cursor-pointer" onClick={onClick}>
      <Input
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        className="h-11 pr-9"
        onChange={() => {}}
      />
      <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export default function FormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mode = id ? 'edit' : 'create';

  const [route, setRoute] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driver, setDriver] = useState('');
  const [conductor, setConductor] = useState('');
  const [boardTime, setBoardTime] = useState('');
  const [boardLocation, setBoardLocation] = useState('');
  const [alightTime, setAlightTime] = useState('');
  const [alightLocation, setAlightLocation] = useState('');
  const [remark, setRemark] = useState('');
  const [inspector, setInspector] = useState('');
  const [inspectionDate, setInspectionDate] = useState(() => todayStr());
  const [items, setItems] = useState(() => emptyItems());
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [inspectorPickerOpen, setInspectorPickerOpen] = useState(false);
  const snapshotRestored = useRef(false);
  const draftTimer = useRef(null);
  const inspectorHistory = getInspectorHistory();

  useEffect(() => {
    if (!id) return;
    const rec = getRecords().find((r) => r.id === id);
    if (!rec) {
      setNotFound(true);
      return;
    }
    applyInitial(rec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function applyInitial(rec) {
    if (snapshotRestored.current) {
      snapshotRestored.current = false;
      return;
    }
    setRoute(rec.route || '');
    setPlateNumber(rec.plateNumber || '');
    setDriver(rec.driver || '');
    setConductor(rec.conductor || '');
    setBoardTime(rec.boardTime || '');
    setBoardLocation(rec.boardLocation || '');
    setAlightTime(rec.alightTime || '');
    setAlightLocation(rec.alightLocation || '');
    setRemark(rec.remark || '');
    setInspector(rec.inspector || '');
    setInspectionDate(rec.inspectionDate || todayStr());
    setItems(Object.fromEntries(CHECK_ITEMS.map((c) => [c.key, rec[c.key] ?? null])));
  }

  useEffect(() => {
    const snap = sessionStorage.getItem('inspectionFormSnapshot');
    const pick = sessionStorage.getItem('pickResult');
    if (snap) {
      snapshotRestored.current = true;
      try {
        const K = JSON.parse(snap);
        applyPayload(K);
      } catch (e) {
        console.error('恢复表单快照失败', e);
      } finally {
        sessionStorage.removeItem('inspectionFormSnapshot');
      }
    } else if (!id) {
      const draft = getDraft();
      if (draft && !isDraftEmpty(draft)) {
        applyPayload(draft);
        setDraftRestored(true);
        toast('已恢复上次未提交的草稿');
      }
    }
    if (pick) {
      try {
        const { field, value } = JSON.parse(pick);
        switch (field) {
          case 'route':
            setRoute(value);
            break;
          case 'driver':
            setDriver(value);
            break;
          case 'conductor':
            setConductor(value);
            break;
          case 'boardLocation':
            setBoardLocation(value);
            break;
          case 'alightLocation':
            setAlightLocation(value);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('解析选择结果失败', e);
      } finally {
        sessionStorage.removeItem('pickResult');
      }
    }
  }, []);

  function applyPayload(K) {
    if (K.route !== undefined) setRoute(K.route);
    if (K.plateNumber !== undefined) setPlateNumber(K.plateNumber);
    if (K.driver !== undefined) setDriver(K.driver);
    if (K.conductor !== undefined) setConductor(K.conductor);
    if (K.boardTime !== undefined) setBoardTime(K.boardTime);
    if (K.boardLocation !== undefined) setBoardLocation(K.boardLocation);
    if (K.alightTime !== undefined) setAlightTime(K.alightTime);
    if (K.alightLocation !== undefined) setAlightLocation(K.alightLocation);
    if (K.remark !== undefined) setRemark(K.remark);
    if (K.inspector !== undefined) setInspector(K.inspector);
    if (K.inspectionDate !== undefined) setInspectionDate(K.inspectionDate);
    if (K.items) setItems(K.items);
  }

  useEffect(() => {
    if (id) return undefined;
    const payload = {
      route,
      plateNumber,
      driver,
      conductor,
      boardTime,
      boardLocation,
      alightTime,
      alightLocation,
      remark,
      inspector,
      inspectionDate,
      items,
    };
    draftTimer.current = setTimeout(() => {
      if (isDraftEmpty(payload)) clearDraft();
      else saveDraft(payload);
    }, 500);
    return () => clearTimeout(draftTimer.current);
  }, [
    id,
    route,
    plateNumber,
    driver,
    conductor,
    boardTime,
    boardLocation,
    alightTime,
    alightLocation,
    remark,
    inspector,
    inspectionDate,
    items,
  ]);

  const openPick = (field) => {
    if (field !== 'route' && !route.trim()) {
      toast('请先选择线路', 'error');
      return;
    }
    sessionStorage.setItem(
      'inspectionFormSnapshot',
      JSON.stringify({
        route,
        plateNumber,
        driver,
        conductor,
        boardTime,
        boardLocation,
        alightTime,
        alightLocation,
        remark,
        inspector,
        inspectionDate,
        items,
      })
    );
    sessionStorage.setItem('pickRouteName', route.trim());
    navigate(`/pick/${field}`);
  };

  const toggleItem = (key, status) => {
    setItems((prev) => ({ ...prev, [key]: status }));
  };

  const handleClearDraft = () => {
    clearDraft();
    setRoute('');
    setPlateNumber('');
    setDriver('');
    setConductor('');
    setBoardTime('');
    setBoardLocation('');
    setAlightTime('');
    setAlightLocation('');
    setRemark('');
    setInspector('');
    setInspectionDate(todayStr());
    setItems(emptyItems());
    setDraftRestored(false);
    toast('草稿已清空');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        route,
        plateNumber,
        driver,
        conductor,
        boardTime,
        boardLocation,
        alightTime,
        alightLocation,
        ...Object.fromEntries(CHECK_ITEMS.map((c) => [c.key, items[c.key]])),
        remark,
        inspector,
        inspectionDate,
      };
      addInspector(payload.inspector);
      if (mode === 'create') {
        createRecord(payload);
        clearDraft();
        toast('检查记录已创建');
      } else {
        updateRecord(id, payload);
        toast('检查记录已更新');
      }
      navigate('/jump');
    } catch (err) {
      console.error('提交检查记录失败', err);
      toast('提交失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-destructive">记录不存在，可能已被删除。</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 px-1">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="arrowLeft" className="size-5" />
        </Button>
        <h1 className="flex-1 text-lg font-semibold">{mode === 'create' ? '新建检查记录' : '编辑检查记录'}</h1>
        {mode === 'create' && draftRestored && (
          <Button type="button" variant="outline" size="sm" onClick={handleClearDraft}>
            清空草稿
          </Button>
        )}
      </div>

      <Card className="p-5">
        <h2 className="pb-4 text-base font-semibold">基本信息</h2>
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          <Field label="线路">
            <PickInput value={route} placeholder="如：1路、20路" onClick={() => openPick('route')} />
          </Field>
          <Field label="车牌/自编号">
            <Input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="车牌号或自编号" className="h-11" />
          </Field>
          <Field label="驾驶员">
            <PickInput value={driver} placeholder="驾驶员姓名" onClick={() => openPick('driver')} />
          </Field>
          <Field label="售票员">
            <PickInput value={conductor} placeholder="售票员姓名（可选）" onClick={() => openPick('conductor')} />
          </Field>
          <Field label="上车时间">
            <Input type="time" value={boardTime} onChange={(e) => setBoardTime(e.target.value)} className="h-11" />
          </Field>
          <Field label="上车地点">
            <PickInput value={boardLocation} placeholder="站点名称" onClick={() => openPick('boardLocation')} />
          </Field>
          <Field label="下车时间">
            <Input type="time" value={alightTime} onChange={(e) => setAlightTime(e.target.value)} className="h-11" />
          </Field>
          <Field label="下车地点">
            <PickInput value={alightLocation} placeholder="站点名称" onClick={() => openPick('alightLocation')} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-row items-center justify-between pb-4">
          <h2 className="text-base font-semibold">检查项目</h2>
          <span className="rounded-md border border-border px-2.5 py-0.5 font-mono text-xs">共 {CHECK_ITEMS.length} 项</span>
        </div>
        <div className="space-y-0">
          {CHECK_ITEMS.map((item, idx) => (
            <div key={item.key} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ItemToggle item={item} value={items[item.key]} onChange={(v) => toggleItem(item.key, v)} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="pb-4 text-base font-semibold">其他信息</h2>
        <div className="space-y-4">
          <Field label="备注">
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="填写检查过程中的补充说明（可选）"
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="检查人">
              <div className="flex gap-2">
                <Input
                  value={inspector}
                  onChange={(e) => setInspector(e.target.value)}
                  placeholder="检查人姓名"
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label="从历史检查人中选择"
                  onClick={() => setInspectorPickerOpen(true)}
                  className="h-11 w-11 shrink-0"
                >
                  <Icon name="history" className="size-5" />
                </Button>
              </div>
            </Field>
            <Field label="检查日期">
              <Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} className="h-11" />
            </Field>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 px-1">
        <Button type="submit" size="lg" disabled={submitting} className="h-12 w-full text-base shadow-lg">
          {submitting && <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          {mode === 'create' ? '提交检查记录' : '保存修改'}
        </Button>
      </div>

      <Modal
        open={inspectorPickerOpen}
        onClose={() => setInspectorPickerOpen(false)}
        title="选择检查人"
      >
        {inspectorHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无历史检查人，保存记录后会自动记录</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {inspectorHistory.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => {
                    setInspector(n);
                    setInspectorPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between py-3 text-left text-base font-medium active:scale-[0.99]"
                >
                  <span>{n}</span>
                  <Icon name="chevronRight" className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </form>
  );
}
