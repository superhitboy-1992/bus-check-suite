import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea, toast } from '../components/ui';
import { Icon } from '../components/icons';
import { search } from '../lib/search';
import { readFile } from '../lib/stationImport';
import { todayStr } from '../lib/dates';
import { normalizePlate } from '../lib/stationCore';
import { downloadBlob } from '../lib/export';
import {
  addBasicItem,
  addBasicString,
  buildBackupPayload,
  clearAllData,
  deleteBasicItem,
  deleteBasicString,
  deleteFleet,
  describeBackup,
  importBackupMerge,
  mergeCatalogItems,
  renameFleet,
  replaceBasicStrings,
  saveStationReminder,
  setRouteFleet,
  swapStations,
  updateBasicItem,
  useBasicData,
  useStationRecords,
} from '../lib/storage';

const TABS = [
  { key: 'route', label: '线路' },
  { key: 'station', label: '站点' },
  { key: 'plate', label: '车号' },
  { key: 'inspector', label: '检查人' },
  { key: 'driver', label: '驾驶员' },
  { key: 'conductor', label: '售票员' },
  { key: 'fleet', label: '车队' },
  { key: 'import', label: 'Excel 导入' },
  { key: 'backup', label: '备份/恢复' },
];

const STRING_TABS = new Set(['plate', 'inspector']);
const OBJ_TABS = new Set(['route', 'station', 'driver', 'conductor']);

export default function BasicDataPage() {
  const location = useLocation();
  const basicData = useBasicData();
  const stationRecords = useStationRecords();
  const [tab, setTab] = useState(() => location.state?.tab || 'route');
  const [query, setQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(''); // '' = 通用站点，其余为线路名
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [routeInput, setRouteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [plateBulk, setPlateBulk] = useState('');
  const [fleetInput, setFleetInput] = useState('');
  const [fleetRename, setFleetRename] = useState({});
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [backupFile, setBackupFile] = useState(null);
  const [backupDesc, setBackupDesc] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const fileRef = useRef(null);
  const backupFileRef = useRef(null);

  const routes = basicData.routes;
  const fleets = basicData.fleets;

  // 通用列表：对象类型 -> {id,name,routeName}，字符串类型 -> 名字数组
  const objList = useMemo(() => {
    if (tab === 'route') return routes;
    if (tab === 'station') return basicData.stations;
    if (tab === 'driver') return basicData.drivers;
    if (tab === 'conductor') return basicData.conductors;
    return [];
  }, [tab, routes, basicData.stations, basicData.drivers, basicData.conductors]);

  const strList = useMemo(() => {
    if (tab === 'plate') return basicData.plates;
    if (tab === 'inspector') return basicData.inspectors;
    return [];
  }, [tab, basicData.plates, basicData.inspectors]);

  const displayObj = useMemo(() => {
    let list = objList;
    if (tab === 'station') {
      list = list.filter((s) => s.routeName === selectedRoute);
    }
    if (tab === 'route' || tab === 'driver' || tab === 'conductor' || tab === 'station') {
      const names = new Set(search(list.map((i) => i.name), query, 0).map((m) => m.value));
      list = list.filter((i) => names.has(i.name));
    }
    return list;
  }, [tab, objList, query, selectedRoute]);

  const displayStr = useMemo(() => {
    if (!query) return strList;
    return search(strList, query, 0).map((m) => m.value);
  }, [strList, query]);

  const itemLabel = tab === 'route' ? '线路' : tab === 'station' ? '站点' : tab === 'driver' ? '驾驶员' : '售票员';

  function openCreate() {
    setEditing(null);
    setNameInput('');
    setRouteInput('');
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setNameInput(item.name || '');
    setRouteInput(item.routeName || '');
    setDialogOpen(true);
  }

  function saveObj() {
    if (!nameInput.trim()) {
      toast('名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const patch = { name: nameInput.trim() };
        if (tab === 'driver' || tab === 'conductor') patch.routeName = routeInput || '';
        updateBasicItem(tab, editing.id, patch);
        toast('更新成功');
      } else {
        const item = { name: nameInput.trim() };
        if (tab === 'driver' || tab === 'conductor') item.routeName = routeInput || '';
        if (tab === 'station') item.routeName = selectedRoute;
        if (tab === 'station') item.sortOrder = objList.filter((s) => s.routeName === selectedRoute).length;
        addBasicItem(tab, item);
        toast('创建成功');
      }
      setDialogOpen(false);
    } catch (e) {
      console.error('保存失败', e);
      toast('保存失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  function removeObj() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      deleteBasicItem(tab, deleteTarget.id);
      toast('删除成功');
      setDeleteTarget(null);
    } catch (e) {
      console.error('删除失败', e);
      toast('删除失败，请稍后重试', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  function removeString() {
    if (!deleteTarget) return;
    deleteBasicString(tab, deleteTarget);
    toast('删除成功');
    setDeleteTarget(null);
  }

  function addStringValue() {
    const v = tab === 'plate' ? normalizePlate(nameInput) : nameInput.trim();
    if (!v) {
      toast('请输入名称', 'error');
      return;
    }
    if (addBasicString(tab, v)) {
      setNameInput('');
      toast('已添加');
    } else {
      toast('名称不能为空', 'error');
    }
  }

  function savePlateBulk() {
    const list = plateBulk.split('\n').map((s) => normalizePlate(s)).filter(Boolean);
    if (!list.length) {
      toast('请输入车号，每行一个', 'error');
      return;
    }
    replaceBasicStrings('plate', [...basicData.plates, ...list]);
    setPlateBulk('');
    toast('已保存车号选项');
  }

  function moveStation(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= displayObj.length) return;
    swapStations(idx, target, selectedRoute);
    toast('排序已更新');
  }

  function addFleet() {
    const v = fleetInput.trim();
    if (!v) {
      toast('请输入车队名称', 'error');
      return;
    }
    if (basicData.fleets.includes(v)) {
      toast(`车队「${v}」已存在`, 'error');
      return;
    }
    addBasicString('fleet', v);
    setFleetInput('');
    toast('已添加车队');
  }

  function commitFleetRename(oldName) {
    const v = String(fleetRename[oldName] || '').trim();
    if (!v || v === oldName) {
      setFleetRename((prev) => {
        const next = { ...prev };
        delete next[oldName];
        return next;
      });
      return;
    }
    if (renameFleet(oldName, v)) toast('已重命名');
    else toast(`车队「${v}」已存在或名称无效`, 'error');
    setFleetRename((prev) => {
      const next = { ...prev };
      delete next[oldName];
      return next;
    });
  }

  function confirmDeleteFleet() {
    if (!deleteTarget) return;
    deleteFleet(deleteTarget);
    toast('已删除车队，线路回到未分类');
    setDeleteTarget(null);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = readFile(buf);
      if (
        !parsed.stations.length &&
        !parsed.routes.length &&
        !parsed.checkers.length &&
        !parsed.drivers.length &&
        !parsed.conductors.length
      ) {
        toast('未从文件中识别到站点/线路/驻站人/司售名单，请确认文件格式', 'error');
        return;
      }
      setImportPreview(parsed);
    } catch (err) {
      console.error('解析 Excel 失败', err);
      toast('文件解析失败，请确认是有效的 Excel/CSV 文件', 'error');
    }
  }

  function confirmImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const r = mergeCatalogItems(importPreview);
      const parts = [
        `站点新增 ${r.addedStations} 条`,
        `线路新增 ${r.addedRoutes} 条`,
        `驻站人新增 ${r.addedCheckers} 条`,
      ];
      if (r.addedDrivers || r.filledDrivers) {
        parts.push(`驾驶员新增 ${r.addedDrivers} 条、补充线路 ${r.filledDrivers} 条`);
      }
      if (r.addedConductors || r.filledConductors) {
        parts.push(`售票员新增 ${r.addedConductors} 条、补充线路 ${r.filledConductors} 条`);
      }
      toast(`已导入：${parts.join('、')}`);
      setImportPreview(null);
    } catch (err) {
      console.error('导入失败', err);
      toast('导入失败', 'error');
    } finally {
      setImporting(false);
    }
  }

  function exportBackup() {
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `公交检查助手备份-${todayStr()}.json`);
    saveStationReminder({ lastBackupAt: Date.now(), lastBackupCount: stationRecords.length });
    toast('备份文件已导出');
  }

  async function handleBackupFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const desc = describeBackup(parsed);
      setBackupFile(parsed);
      setBackupDesc(desc);
    } catch (err) {
      console.error('解析备份失败', err);
      toast('备份文件格式不正确或解析失败', 'error');
    }
  }

  function confirmBackupImport() {
    if (!backupFile) return;
    try {
      const r = importBackupMerge(backupFile);
      toast(
        `导入成功：跳车记录新增 ${r.recordsAdded} 条，驻站记录新增 ${r.stationRecordsAdded} 条（资料库已合并去重）`
      );
      setBackupFile(null);
      setBackupDesc(null);
    } catch (err) {
      console.error('导入备份失败', err);
      toast('导入备份失败', 'error');
    }
  }

  function confirmClearAll() {
    clearAllData();
    toast('已清空全部数据');
    setClearConfirm(false);
  }

  const backupKindLabel = {
    v2: '统一备份（公交检查助手）',
    'jump-v1': '旧版跳车检查备份',
    'station-v1': '旧版驻站检查备份',
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-30 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-accent p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setQuery('');
                setDeleteTarget(null);
              }}
              className={`min-w-fit flex-1 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'backup' ? (
        <Card>
          <div className="space-y-5 p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">数据备份</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                数据仅保存在当前浏览器的 localStorage 中，清理缓存或更换设备会丢失。备份文件同时包含跳车记录、驻站记录与全部基础资料。
              </p>
              <Button className="mt-4" onClick={exportBackup}>
                <Icon name="download" className="size-4" />
                导出 JSON 备份
              </Button>
            </div>
            <div className="border-t border-border pt-5">
              <h2 className="text-base font-semibold text-foreground">数据恢复（合并导入）</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                支持导入本应用备份，也兼容旧版「跳车检查」与旧版「驻站检查」导出的 JSON 备份。导入采用
                <strong> 并集合并</strong>：记录按 id 去重、资料库按名称去重，先后导入两份备份不会互相覆盖。
              </p>
              <Button variant="outline" className="mt-4" onClick={() => backupFileRef.current?.click()}>
                <Icon name="upload" className="size-4" />
                选择备份文件导入
              </Button>
              <input ref={backupFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleBackupFile} />
            </div>
            <div className="border-t border-border pt-5">
              <h2 className="text-base font-semibold text-destructive">危险操作</h2>
              <p className="mt-1 text-sm text-muted-foreground">清空后所有登记记录和基础资料将丢失，且无法恢复。请先备份！</p>
              <Button variant="destructive" className="mt-4" onClick={() => setClearConfirm(true)}>
                清空全部数据
              </Button>
            </div>
          </div>
        </Card>
      ) : tab === 'import' ? (
        <Card>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Excel 导入资料库</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                从现成 Excel（.xlsx/.xls/.csv）一键导入站点、线路、驻站人名单，也支持导入《司售人员名单》
                （按「姓名/岗位/科室/线路」识别驾驶员、售票员及其线路归属）。重复项自动跳过，
                只补充缺失项，不影响已保存的记录。
              </p>
              <Button className="mt-4" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" className="size-4" />
                选择 Excel 文件
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImportFile} />
            </div>
            {importPreview && (
              <div className="rounded-lg border border-border bg-accent/40 p-4 text-sm">
                <p className="font-medium text-foreground">识别结果预览</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>站点：{importPreview.stations.length} 条</li>
                  <li>线路：{importPreview.routes.length} 条</li>
                  <li>驻站人：{importPreview.checkers.length} 条</li>
                  {importPreview.drivers.length > 0 && <li>驾驶员：{importPreview.drivers.length} 条</li>}
                  {importPreview.conductors.length > 0 && <li>售票员：{importPreview.conductors.length} 条</li>}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={confirmImport} disabled={importing}>
                    {importing ? '导入中...' : '确认导入'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setImportPreview(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : tab === 'fleet' ? (
        <Card>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">车队管理</h2>
              <div className="flex gap-1.5">
                <Input
                  value={fleetInput}
                  onChange={(e) => setFleetInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFleet()}
                  placeholder="新增车队名称"
                  className="h-9 w-48"
                />
                <Button size="sm" onClick={addFleet}>
                  添加车队
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              车队用于登记时「先选车队再选线路」；线路归属请在「线路」页调整。删除车队时线路回到「未分类」，线路本身不会删除。
            </p>
            {fleets.length === 0 ? (
              <EmptyState icon="list" title="暂无车队" description="可先添加车队，再到「线路」页分配归属" />
            ) : (
              <div className="divide-y divide-border">
                {fleets.map((name) => {
                  const count = routes.filter((r) => r.fleet === name).length;
                  return (
                    <div key={name} className="flex items-center gap-3 py-3">
                      <Input
                        value={fleetRename[name] ?? name}
                        onChange={(e) => setFleetRename({ ...fleetRename, [name]: e.target.value })}
                        onBlur={() => commitFleetRename(name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.target.blur();
                          }
                        }}
                        className="h-9 max-w-xs flex-1"
                        aria-label="车队名称"
                      />
                      <span className="text-xs whitespace-nowrap text-muted-foreground">{count} 条线路</span>
                      <Button variant="ghost" size="iconSm" className="text-destructive" onClick={() => setDeleteTarget(name)} aria-label="删除车队">
                        <Icon name="trash" className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      ) : STRING_TABS.has(tab) ? (
        <Card>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">{tab === 'plate' ? '常用车号' : '检查人 / 驻站人'}</h2>
              <div className="flex gap-1.5">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addStringValue()}
                  placeholder={tab === 'plate' ? '如：沪A36401D' : '姓名'}
                  className="h-9 w-48"
                />
                <Button size="sm" onClick={addStringValue}>
                  添加
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {tab === 'plate'
                ? '车号输入后自动统一格式（去空格/横线、字母大写）；登记时会自动记忆新车号。'
                : '跳车检查的「检查人」与驻站检查的「驻站人」共用这份名单。'}
            </p>

            {tab === 'plate' && (
              <div className="rounded-lg border border-border bg-accent/40 p-3">
                <label className="text-sm font-medium text-foreground">批量粘贴车号</label>
                <Textarea
                  value={plateBulk}
                  onChange={(e) => setPlateBulk(e.target.value)}
                  rows={4}
                  placeholder="每行一个车号"
                  className="mt-1.5"
                />
                <Button size="sm" className="mt-2" onClick={savePlateBulk}>
                  保存到常用车号
                </Button>
              </div>
            )}

            <div>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索…" className="mb-2 h-9" />
              {displayStr.length === 0 ? (
                <EmptyState icon="list" title="暂无数据" description="可手动添加或从 Excel 导入" />
              ) : (
                <div className="divide-y divide-border">
                  {displayStr.map((v) => (
                    <div key={v} className="flex h-12 items-center justify-between px-1">
                      <span className="truncate text-base font-medium">{v}</span>
                      <Button variant="ghost" size="iconSm" className="text-destructive" onClick={() => setDeleteTarget(v)} aria-label="删除">
                        <Icon name="trash" className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2">
                {tab === 'station' && (
                  <select
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    className="h-10 max-w-xs rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-primary"
                  >
                    <option value="">通用站点（未归线路）</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索…" className="h-10 max-w-xs" />
              </div>
              <Button onClick={openCreate}>
                <Icon name="plus" className="size-4" />
                新增{itemLabel}
              </Button>
            </div>

            {displayObj.length === 0 ? (
              <EmptyState icon="list" title="暂无数据" description={tab === 'station' ? '选择线路后管理该线路站点，或选择「通用站点」维护全部站点' : '可手动添加或从 Excel 导入'} />
            ) : (
              <div className="divide-y divide-border">
                {displayObj.map((item, idx) => (
                  <div key={item.id} className="flex h-14 items-center justify-between px-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-medium">{item.name}</div>
                      {tab === 'station' && selectedRoute && <div className="truncate text-sm text-muted-foreground">{item.routeName}</div>}
                      {(tab === 'driver' || tab === 'conductor') && item.routeName && (
                        <div className="truncate text-sm text-muted-foreground">{item.routeName}</div>
                      )}
                      {tab === 'route' && (
                        <div className="truncate text-sm text-muted-foreground">{item.fleet ? `车队：${item.fleet}` : '未分类'}</div>
                      )}
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1">
                      {tab === 'route' && (
                        <select
                          value={item.fleet || ''}
                          onChange={(e) => setRouteFleet(item.id, e.target.value)}
                          className="h-8 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus-visible:border-primary"
                          aria-label={`${item.name} 所属车队`}
                        >
                          <option value="">未分类</option>
                          {fleets.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      )}
                      {tab === 'station' && (
                        <>
                          <Button variant="ghost" size="iconSm" aria-label="上移" disabled={idx === 0} onClick={() => moveStation(idx, -1)}>
                            <Icon name="chevronUp" className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label="下移"
                            disabled={idx === displayObj.length - 1}
                            onClick={() => moveStation(idx, 1)}
                          >
                            <Icon name="chevronDown" className="size-4" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="iconSm" aria-label="编辑" onClick={() => openEdit(item)}>
                        <Icon name="pencil" className="size-4" />
                      </Button>
                      <Button variant="ghost" size="iconSm" className="text-destructive" aria-label="删除" onClick={() => setDeleteTarget(item)}>
                        <Icon name="trash" className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editing ? '编辑' : '新增'}${itemLabel}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={saveObj} disabled={saving}>
              {saving ? '保存中...' : '确定'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <Field label={tab === 'route' ? '线路名称' : tab === 'station' ? '站点名称' : '姓名'}>
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="请输入名称" />
          </Field>
          {(tab === 'driver' || tab === 'conductor') && (
            <Field label="所属线路">
              <select
                value={routeInput}
                onChange={(e) => setRouteInput(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-transparent px-3 text-base outline-none focus-visible:border-primary md:text-sm"
              >
                <option value="">请选择线路</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        description={
          deleteTarget
            ? tab === 'fleet'
              ? `确定删除车队「${deleteTarget}」吗？该车队线路将回到「未分类」，线路本身不会删除。`
              : `确定要删除「${typeof deleteTarget === 'object' ? deleteTarget.name : deleteTarget}」吗？已保存的记录不受影响。`
            : ''
        }
        busy={deleteBusy}
        onConfirm={tab === 'fleet' ? confirmDeleteFleet : STRING_TABS.has(tab) ? removeString : removeObj}
      />

      <ConfirmDialog
        open={!!backupDesc}
        onClose={() => {
          setBackupFile(null);
          setBackupDesc(null);
        }}
        title="确认导入备份"
        confirmText="合并导入"
        description={
          backupDesc
            ? `识别为「${backupKindLabel[backupDesc.kind]}」：包含跳车记录 ${backupDesc.recordsCount} 条、驻站记录 ${backupDesc.stationRecordsCount} 条。导入将按并集合并，不覆盖现有数据。`
            : ''
        }
        onConfirm={confirmBackupImport}
      />

      <ConfirmDialog
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        title="确认清空全部数据"
        confirmText="清空"
        description="此操作不可恢复，将删除全部跳车记录、驻站记录与基础资料。确定继续吗？"
        onConfirm={confirmClearAll}
      />
    </div>
  );
}
