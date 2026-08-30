import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CHECK_ITEMS } from '../lib/constants';
import { deleteRecord, getRecords, restoreLastDeleted } from '../lib/storage';
import { Icon } from '../components/icons';
import { Badge, Button, Card, ConfirmDialog, toast } from '../components/ui';

const FIELDS = [
  { key: 'route', label: '线路' },
  { key: 'plateNumber', label: '车牌/自编号' },
  { key: 'driver', label: '驾驶员' },
  { key: 'conductor', label: '售票员' },
  { key: 'boardTime', label: '上车时间' },
  { key: 'boardLocation', label: '上车地点' },
  { key: 'alightTime', label: '下车时间' },
  { key: 'alightLocation', label: '下车地点' },
  { key: 'inspector', label: '检查人' },
  { key: 'inspectionDate', label: '检查日期' },
];

function StatusBadge({ status }) {
  const v = status ?? 'pending';
  const meta = {
    pass: { label: '合格', variant: 'success', mark: '✓' },
    fail: { label: '不合格', variant: 'destructive', mark: '×' },
    pending: { label: '待确认', variant: 'muted', mark: '' },
  }[v];
  return (
    <Badge variant={meta.variant} className="gap-1 px-2.5 py-1">
      {meta.mark && <span className="text-sm">{meta.mark}</span>}
      <span>{meta.label}</span>
    </Badge>
  );
}

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const record = useMemo(() => getRecords().find((r) => r.id === id) || null, [id]);

  if (!record) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="text-center">
          <p className="text-base font-medium">记录不存在</p>
          <p className="mt-1 text-sm text-muted-foreground">该检查记录可能已被删除或 ID 无效。</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate('/jump')}>
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      deleteRecord(record.id);
      toast('删除成功', 'success', {
        action: {
          label: '撤销',
          onClick: () => {
            restoreLastDeleted();
            toast('已恢复删除的记录');
          },
        },
      });
      navigate('/jump');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col gap-4 pb-28 font-sans">
      <header className="no-print sticky top-0 z-10 -mx-4 -mt-4 flex h-14 items-center border-b border-border bg-card/95 px-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="arrowLeft" className="size-5" />
        </Button>
        <h1 className="flex-1 text-center text-base font-semibold">检查记录详情</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate('/jump')} aria-label="返回台账">
          <Icon name="home" className="size-5" />
        </Button>
      </header>

      <Card>
        <div className="p-5">
          <h2 className="pb-3 text-base font-semibold">基本信息</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="text-sm font-medium">{String(record[f.key] ?? '-')}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="pb-3 text-base font-semibold">检查项目（{CHECK_ITEMS.length}项）</h2>
          <div className="flex flex-col gap-0">
            {CHECK_ITEMS.map((item, idx) => (
              <div key={item.key}>
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="truncate text-sm font-medium">{item.name}</span>
                    </div>
                    <p className="ml-6 line-clamp-2 text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <StatusBadge status={record[item.key]} />
                </div>
                {idx < CHECK_ITEMS.length - 1 && <div className="h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="pb-3 text-base font-semibold">备注</h2>
          <p className="text-sm whitespace-pre-wrap">{record.remark?.trim() ? record.remark : '无'}</p>
        </div>
      </Card>

      <div className="no-print pb-safe fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-3 p-4">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/jump')}>
            <Icon name="home" className="size-4" />
            返回首页
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => navigate(`/edit/${record.id}`)}>
            <Icon name="pencil" className="size-4" />
            编辑
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" className="size-4" />
            删除
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="确认删除"
        description={`确定要删除线路 ${record.route}（车牌 ${record.plateNumber}）的检查记录吗？此操作不可恢复。`}
        busy={deleteBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
