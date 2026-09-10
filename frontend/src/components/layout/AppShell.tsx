import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  ScrollText,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Boxes,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Role } from '@/types/api';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  /** Omitted means every authenticated role sees it. */
  roles?: Role[];
}

/**
 * The sidebar is filtered by role, so what a user can see matches what the API
 * will actually let them do. This is presentation only — every one of these
 * routes is enforced again on the server.
 */
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/stock', label: 'Stock ledger', icon: ScrollText },
  { to: '/challans', label: 'Sales challans', icon: ClipboardList },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {visible.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Boxes size={17} />
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:text-base">
                ERP <span className="text-slate-400">+</span> CRM
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">{user?.name}</p>
              <p className="text-xs leading-tight text-slate-500">{user?.email}</p>
            </div>
            {user && <RoleBadge role={user.role} />}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
          {nav}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 top-14 z-20 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/30"
              onClick={() => setMobileOpen(false)}
              role="presentation"
            />
            <aside className="relative h-full w-64 border-r border-slate-200 bg-white">{nav}</aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
