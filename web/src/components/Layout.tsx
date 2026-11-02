import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === '/' || pathname === '';
  const onDashboard = pathname.startsWith('/homes/');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">H</div>
          <div>
            <div className="brand-name">HomeSplit</div>
            <div className="brand-sub">Shared Bills</div>
          </div>
        </div>

        <div className="sidebar-section-label">Navigate</div>
        <Link to="/" className={`nav-link ${isHome ? 'active' : ''}`}>
          <Icon path={HOME_ICON} label="Homes" /> Homes
        </Link>
        {onDashboard && (
          <Link to="/" className="nav-link">
            <Icon path={BACK_ICON} label="Back to list" /> Back to list
          </Link>
        )}

        <div className="sidebar-footer">
          v1.0 · SDE Assignment
          <br />
          Built with Hono · Workers · D1
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}

function Icon({ path, label = 'icon' }: { path: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <path d={path} />
    </svg>
  );
}

const HOME_ICON = 'M3 12l9-9 9 9M5 10v10h14V10';
const BACK_ICON = 'M19 12H5M12 19l-7-7 7-7';
