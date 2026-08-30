import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { APP_NAME } from './lib/constants';
import { Icon } from './components/icons';
import { ToastHost } from './components/ui';
import HomePage from './pages/HomePage';
import JumpHomePage from './pages/JumpHomePage';
import FormPage from './pages/FormPage';
import DetailPage from './pages/DetailPage';
import ExportPage from './pages/ExportPage';
import BasicDataPage from './pages/BasicDataPage';
import PickPage from './pages/PickPage';
import StationRegPage from './pages/station/StationRegPage';
import StationListPage from './pages/station/StationListPage';
import StationExportPage from './pages/station/StationExportPage';

const NAV = [
  { path: '/', label: '首页', icon: 'home', end: true },
  { path: '/station/reg', label: '驻站检查', icon: 'station', end: false },
  { path: '/jump', label: '跳车检查', icon: 'bus', end: false },
  { path: '/basic-data', label: '基础数据', icon: 'database', end: false },
];

function Shell() {
  const { pathname } = useLocation();
  const hideChrome =
    pathname.startsWith('/detail/') ||
    pathname.startsWith('/edit/') ||
    pathname.startsWith('/pick/') ||
    pathname === '/new';

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {!hideChrome && (
        <header className="no-print sticky top-0 z-40 border-b border-border bg-card shadow-sm">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <h1 className="text-base font-semibold text-foreground">{APP_NAME}</h1>
          </div>
        </header>
      )}

      <main className={`flex-1 overflow-x-clip ${hideChrome ? '' : 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8'}`}>
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/jump" element={<JumpHomePage />} />
            <Route path="/new" element={<FormPage />} />
            <Route path="/edit/:id" element={<FormPage />} />
            <Route path="/detail/:id" element={<DetailPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/basic-data" element={<BasicDataPage />} />
            <Route path="/pick/:field" element={<PickPage />} />
            <Route path="/station" element={<Navigate to="/station/reg" replace />} />
            <Route path="/station/reg" element={<StationRegPage />} />
            <Route path="/station/list" element={<StationListPage />} />
            <Route path="/station/export" element={<StationExportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      {!hideChrome && (
        <nav className="no-print pb-safe fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:static md:z-auto md:border-t-0 md:border-b md:bg-transparent md:pb-0">
          <div className="mx-auto flex max-w-5xl items-center justify-around md:h-14 md:justify-start md:gap-6 md:px-4">
            {NAV.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors md:inline-flex md:flex-row md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-sm md:font-medium ${
                    isActive
                      ? 'text-primary md:bg-primary md:text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground md:hover:bg-accent'
                  }`
                }
              >
                <Icon name={item.icon} className="size-5 md:size-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell />
    </HashRouter>
  );
}
