import { useState } from 'react';
import { useRecords } from '../lib/storage';
import { matchRecord } from '../lib/filter';
import { buildCSVBlob, buildRows, buildXLSXBlob, downloadBlob, exportFilename } from '../lib/export';
import { monthStartStr, todayStr } from '../lib/dates';
import { Icon } from '../components/icons';
import { Button, Card, DateInput, Field, Input, toast } from '../components/ui';

function Alert({ variant, icon, title, children }) {
  const styles =
    variant === 'destructive'
      ? 'border-destructive/50 bg-destructive/5 text-destructive'
      : 'border-warning/50 bg-warning/5 text-warning';
  return (
    <div className={`flex gap-2 rounded-lg border p-4 text-sm ${styles}`}>
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default function ExportPage() {
  const records = useRecords();
  const [dateFrom, setDateFrom] = useState(() => monthStartStr());
  const [dateTo, setDateTo] = useState(() => todayStr());
  const [route, setRoute] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [format, setFormat] = useState('xlsx');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);

  const generate = () => {
    if (!dateFrom || !dateTo) {
      toast('请选择日期范围', 'error');
      return;
    }
    if (dateFrom > dateTo) {
      toast('起始日期不能晚于结束日期', 'error');
      return;
    }
    const filters = {
      dateFrom,
      dateTo,
      route: route.trim(),
      plateNumber: plateNumber.trim(),
    };
    const matched = records
      .filter((r) => matchRecord(r, filters))
      .sort((a, b) => {
        const d = a.inspectionDate.localeCompare(b.inspectionDate);
        return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
      });
    if (matched.length === 0) {
      setStatus('empty');
      setResult(null);
      return;
    }
    try {
      const rows = buildRows(matched);
      const blob = format === 'xlsx' ? buildXLSXBlob(rows) : buildCSVBlob(matched);
      setResult({
        filename: exportFilename(dateFrom, format),
        recordCount: matched.length,
        format,
        blob,
      });
      setStatus('success');
      setErrorMsg('');
      toast('导出文件生成成功');
    } catch (e) {
      console.error('导出数据失败', e);
      setStatus('error');
      setErrorMsg('导出过程中出现错误，请稍后重试。');
      toast('导出失败', 'error');
    }
  };

  const download = () => {
    if (result) downloadBlob(result.blob, result.filename);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">数据导出</h1>
        <p className="text-sm text-muted-foreground">按条件筛选检查记录，导出为 Excel 或 CSV 文件</p>
      </div>

      <Card>
        <div className="p-5 pb-3">
          <h2 className="text-lg font-semibold">导出配置</h2>
          <p className="text-sm text-muted-foreground">设置筛选条件和导出格式，点击生成导出文件</p>
        </div>
        <div className="space-y-5 p-5 pt-0">
          <Field label="日期范围">
            <div className="flex items-center gap-2">
              <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg" />
              <span className="text-sm text-muted-foreground">~</span>
              <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg" />
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="线路（可选）">
              <Input type="text" placeholder="如：1路" value={route} onChange={(e) => setRoute(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="车牌/自编号（可选）">
              <Input
                type="text"
                placeholder="如：粤B12345"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                className="rounded-lg"
              />
            </Field>
          </div>
          <Field label="导出格式">
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  format === 'xlsx'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-foreground hover:bg-accent'
                }`}
              >
                <Icon name="file" className="size-4" />
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  format === 'csv'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-foreground hover:bg-accent'
                }`}
              >
                <Icon name="table" className="size-4" />
                CSV
              </button>
            </div>
          </Field>
          <div className="flex flex-col items-stretch gap-3">
            <Button onClick={generate} className="w-full md:w-auto md:min-w-48">
              <Icon name="download" className="size-4" />
              生成导出文件
            </Button>
          </div>
        </div>
      </Card>

      {status === 'empty' && (
        <Alert variant="warning" icon="alert" title="暂无数据">
          所选范围内暂无数据可导出，请调整筛选条件后重试。
        </Alert>
      )}
      {status === 'error' && (
        <Alert variant="destructive" icon="alert" title="导出失败">
          {errorMsg}
        </Alert>
      )}
      {status === 'success' && result && (
        <Card>
          <div className="p-5 pb-3">
            <div className="flex items-center gap-2">
              <Icon name="circleCheck" className="size-5 text-success" />
              <h2 className="text-base text-success">导出成功</h2>
            </div>
          </div>
          <div className="space-y-3 p-5 pt-0">
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div className="text-muted-foreground">
                文件名：
                <span className="font-medium break-words text-foreground">{result.filename}</span>
              </div>
              <div className="text-muted-foreground">
                格式：
                <span className="font-medium text-foreground">{result.format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}</span>
              </div>
              <div className="text-muted-foreground">
                记录数：
                <span className="font-medium text-foreground">{result.recordCount} 条</span>
              </div>
            </div>
            <Button onClick={download} className="w-full md:w-auto md:min-w-40">
              <Icon name="download" className="size-4" />
              下载文件
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
