import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/station/reg', label: '登记记录' },
  { to: '/station/list', label: '记录查询' },
  { to: '/station/export', label: '导出表格' },
];

export default function StationTabs() {
  return (
    <div className="no-print mb-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-accent p-1">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/station/reg'}
          className={({ isActive }) =>
            `inline-flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
