import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Button, Card } from '../components/ui';
import { useRecords, useStationRecords } from '../lib/storage';
import { todayStr } from '../lib/dates';

const MODULES = [
  {
    key: 'station',
    title: '驻站检查',
    desc: '现场登记每辆车的过站情况，按「日期 + 站点」自动生成《驻站记录表》（30 行模板、可批量 ZIP）。',
    to: '/station/reg',
    icon: 'station',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'jump',
    title: '跳车检查',
    desc: '乘车随检 14 项检查记录、台账与当日表格打印，日/周/月统计，一键导出 Excel/CSV。',
    to: '/jump',
    icon: 'bus',
    accent: 'from-sky-500 to-blue-600',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const records = useRecords();
  const stationRecords = useStationRecords();
  const today = todayStr();
  const jumpToday = records.filter((r) => r.inspectionDate === today).length;
  const stationToday = stationRecords.filter((r) => r.date === today).length;

  return (
    <div className="space-y-6">
      <section className="text-center">
        <h2 className="text-2xl font-bold text-foreground">欢迎使用公交检查助手</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          驻站检查与跳车检查合为一体，线路、站点、车号、检查人等基础资料共用一份，数据自动互通。
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Icon name="station" className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stationToday}</p>
            <p className="text-xs text-muted-foreground">今日驻站记录</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Icon name="bus" className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{jumpToday}</p>
            <p className="text-xs text-muted-foreground">今日跳车记录</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="database" className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stationRecords.length + records.length}</p>
            <p className="text-xs text-muted-foreground">累计记录</p>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((m) => (
          <Card key={m.key} className="overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${m.accent}`} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate(m.to)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(m.to);
                }
              }}
              className="flex w-full cursor-pointer flex-col items-start gap-3 p-6 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className={`flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${m.accent} text-white shadow-md`}>
                <Icon name={m.icon} className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{m.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              </div>
              <Button variant="outline" size="sm" className="mt-1">
                进入{m.title}
                <Icon name="chevronRight" className="size-4" />
              </Button>
            </div>
          </Card>
        ))}
      </section>

      <Card className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-muted-foreground">
            <Icon name="database" className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">基础资料与备份</p>
            <p className="text-xs text-muted-foreground">线路（含车队）、站点、车号、检查人、驾驶员、售票员统一维护；支持导入旧应用备份。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/basic-data')}>
          管理基础数据
        </Button>
      </Card>
    </div>
  );
}
