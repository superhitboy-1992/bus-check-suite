import { useMemo, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Modal, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import StationTabs from './StationTabs';
import { useStationRecords } from '../../lib/storage';
import { dateDot, groupRecords, humanSize, normalize, safeName, toRecordRows } from '../../lib/stationCore';
import { generate, zip } from '../../lib/stationXlsx';

const EMBEDDED_HINTS = {
  wechat: '当前是微信内置浏览器，会拦截文件保存。请点右上角「···」→「在浏览器打开」，再重新导出；也可以先试「打开文件」。',
  wecom: '当前是企业微信内置浏览器，会拦截文件保存。请点右上角「···」→「在浏览器打开」，再重新导出。',
  qq: '当前是 QQ 内置浏览器，可能无法保存文件。请点右上角「···」→「在浏览器打开」，再重新导出。',
  uc: '当前是 UC 浏览器，可能限制文件保存。请改用手机自带浏览器或 Chrome/Safari 打开后重新导出。',
  quark: '当前是夸克浏览器，可能限制文件保存。请改用手机自带浏览器或 Chrome/Safari 打开后重新导出。',
  baidu: '当前是百度浏览器，可能限制文件保存。请改用手机自带浏览器或 Chrome/Safari 打开后重新导出。',
};

function detectEmbeddedBrowser() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  if (/wxwork/i.test(ua)) return 'wecom';
  if (/QQ\/|QBCore|MQQBrowser/i.test(ua)) return 'qq';
  if (/UCBrowser|UBrowser/i.test(ua)) return 'uc';
  if (/Quark/i.test(ua)) return 'quark';
  if (/baiduboxapp/i.test(ua)) return 'baidu';
  return null;
}

const embeddedBrowser = detectEmbeddedBrowser();
const embeddedHint = embeddedBrowser ? EMBEDDED_HINTS[embeddedBrowser] : '';

function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1200);
  if (embeddedHint) {
    toast(`已尝试下载：${filename}（当前浏览器可能无法保存，请看弹窗内提示）`, 'error');
  } else {
    toast(`已开始下载：${filename}，请到手机「下载」或「文件」中查看`);
  }
}

function downloadBlob(blob, filename, mime = '') {
  // 桌面 Chrome/Edge 优先使用系统「另存为」对话框，反馈更明确
  if (typeof window.showSaveFilePicker === 'function') {
    const ext = (String(filename).match(/\.([^.]+)$/) || [])[1] || '';
    const types = mime && ext ? [{ description: `${ext.toUpperCase()} 文件`, accept: { [mime]: ['.' + ext] } }] : [];
    try {
      const picker = window.showSaveFilePicker({ suggestedName: filename, types });
      picker
        .then(async (handle) => {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast(`已保存：${filename}`);
        })
        .catch(() => anchorDownload(blob, filename));
      return;
    } catch {
      /* 不支持或调用失败时走标准下载 */
    }
  }
  anchorDownload(blob, filename);
}

function openInNewTab(blob, filename) {
  const url = URL.createObjectURL(blob);
  let win = null;
  try {
    win = typeof window.open === 'function' ? window.open(url, '_blank') : null;
  } catch {
    win = null;
  }
  if (!win) {
    toast('浏览器拦截了新窗口，请允许弹窗后重试，或改用「下载文件」', 'error');
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`已尝试打开：${filename}；若新页面空白，请改用「下载文件」`);
}

function isMobileView() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
}

// 移动端优先走系统分享（微信/邮件等），不可用时降级为下载
function shareOrDownload(blob, filename, mime) {
  if (isMobileView() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).catch((err) => {
          if (err && err.name !== 'AbortError') downloadBlob(blob, filename, mime);
        });
        return;
      }
    } catch {
      /* 继续走下载 */
    }
  }
  downloadBlob(blob, filename, mime);
}

function buildGroupFile(group) {
  return generate(
    { station: group.station, checker: group.checker, dateLabel: group.dateLabel },
    toRecordRows(group.records)
  );
}

function formatTime(d) {
  return new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function StationExportPage() {
  const records = useStationRecords();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [station, setStation] = useState('');
  const [queried, setQueried] = useState(false);
  const [exportedFiles, setExportedFiles] = useState([]);
  const [result, setResult] = useState(null);
  const isMobile = isMobileView();

  const groups = useMemo(() => {
    const list = records.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (station && r.station !== station) return false;
      return true;
    });
    return groupRecords(list);
  }, [records, from, to, station, queried]);

  function pushExport(entry) {
    setExportedFiles((prev) => [entry, ...prev]);
    setResult(entry);
  }

  function exportGroup(g) {
    if (g.count > 30) {
      toast(`该分组有 ${g.count} 条记录，模板最多 30 行，已按时间取前 30 条`, 'error');
    }
    const bin = buildGroupFile(g);
    const filename = `驻站记录表【${dateDot(g.date)}】.xlsx`;
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    pushExport({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename,
      size: bin.length,
      kind: 'xlsx',
      groupLabel: `${g.date} · ${g.station}`,
      recordCount: g.count,
      blob: new Blob([bin], { type: mime }),
      mime,
      time: new Date(),
    });
    toast(`已导出：${filename}`);
  }

  function exportAllZip() {
    if (!groups.length) {
      toast('当前条件下没有可导出的记录', 'error');
      return;
    }
    const used = {};
    const entries = groups.map((g) => {
      const base = `驻站记录表【${dateDot(g.date)}】`;
      let name = base + '.xlsx';
      let n = 0;
      while (used[name]) {
        n++;
        name = base + '_' + safeName(g.station) + (n > 1 ? n : '') + '.xlsx';
      }
      used[name] = true;
      return { name, data: buildGroupFile(g) };
    });
    const bin = zip(entries);
    const filename = `驻站记录表_${from || '起始'}_${to || '结束'}.zip`;
    const mime = 'application/zip';
    pushExport({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename,
      size: bin.length,
      kind: 'zip',
      groupLabel: `${entries.length} 个分组`,
      recordCount: entries.length,
      blob: new Blob([bin], { type: mime }),
      mime,
      time: new Date(),
    });
    toast(`已导出 ${entries.length} 张表格（ZIP）`);
  }

  const downloadResult = () => {
    if (result) downloadBlob(result.blob, result.filename, result.mime);
  };
  const openResultInTab = () => {
    if (result) openInNewTab(result.blob, result.filename);
  };
  const shareResult = () => {
    if (result) shareOrDownload(result.blob, result.filename, result.mime);
  };

  return (
    <div className="space-y-4">
      <StationTabs />

      {embeddedHint && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">{embeddedHint}</p>
        </div>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="日期从">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="至">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="站点">
            <Input value={station} onChange={(e) => setStation(e.target.value)} placeholder="全部" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setQueried((v) => !v)}>
            查询分组
          </Button>
          <Button size="sm" variant="outline" onClick={exportAllZip}>
            批量导出 ZIP
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">共 {groups.length} 个分组</span>
        </div>
      </Card>

      {exportedFiles.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">已导出文件（本次）</h2>
            <Button size="sm" variant="ghost" onClick={() => setExportedFiles([])}>
              清空列表
            </Button>
          </div>
          <div className="mt-2 divide-y divide-border">
            {exportedFiles.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                  <Icon name={f.kind === 'zip' ? 'file' : 'table'} className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.filename}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {humanSize(f.size)} · {f.groupLabel} · {f.kind === 'zip' ? `${f.recordCount} 张` : `${f.recordCount} 条`} ·{' '}
                    {formatTime(f.time)}
                  </p>
                </div>
                {isMobile && (
                  <Button size="sm" variant="outline" onClick={() => shareOrDownload(f.blob, f.filename, f.mime)}>
                    分享
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openInNewTab(f.blob, f.filename)}>
                  打开
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBlob(f.blob, f.filename, f.mime)}>
                  下载
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            文件仅保存在当前页面（本次会话），刷新或离开页面后需重新导出。
          </p>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon="file" title="当前条件下没有记录" description="调整日期或站点范围后重新查询" />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.date + '|' + g.station} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                <Icon name="calendar" className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {g.date} · {g.station}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  驻站人：{g.checker || '—'} · {g.count} 条记录
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportGroup(g)}>
                导出表格
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-accent/40 p-4 text-xs leading-relaxed text-muted-foreground">
        说明：按「日期 + 站点」分组，每组自动生成一张《驻站记录表》（固定 30 行、A4 打印格式），与现成模板一致。
        点击「导出表格」会先弹出导出结果，可在弹窗中下载、打开或分享；已导出的文件会保留在本页列表中，可再次下载。
        手机上可直接分享表格到微信/邮件；批量导出会把多张表打包成一个 ZIP 文件。
        {embeddedHint && ` ${embeddedHint}`}
      </div>

      <Modal
        open={!!result}
        onClose={() => setResult(null)}
        title="导出成功"
        footer={
          <>
            <Button variant="outline" onClick={() => setResult(null)}>
              完成
            </Button>
            <Button variant="outline" onClick={openResultInTab}>
              打开文件
            </Button>
            {isMobile && (
              <Button variant="outline" onClick={shareResult}>
                <Icon name="upload" className="size-4" />
                分享
              </Button>
            )}
            <Button onClick={downloadResult}>
              <Icon name="download" className="size-4" />
              下载文件
            </Button>
          </>
        }
      >
        {result && (
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success">
              <Icon name="circleCheck" className="size-5 shrink-0" />
              <span className="font-medium break-all">{result.filename}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{result.kind === 'zip' ? '内容' : '日期 · 站点'}</p>
                <p className="mt-0.5 break-words font-medium text-foreground">{result.groupLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">文件大小</p>
                <p className="mt-0.5 font-medium text-foreground">{humanSize(result.size)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{result.kind === 'zip' ? '表格数' : '记录数'}</p>
                <p className="mt-0.5 font-medium text-foreground">
                  {result.recordCount} {result.kind === 'zip' ? '张' : '条'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">生成时间</p>
                <p className="mt-0.5 font-medium text-foreground">{formatTime(result.time)}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              点击「下载文件」保存到手机或电脑；手机上也可以直接分享到微信/邮件。
            </p>
            {embeddedHint && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                {embeddedHint}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
