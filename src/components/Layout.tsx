import { NavLink, Outlet } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/categories', label: 'Categories' },
  { to: '/reports', label: 'Reports' },
  { to: '/investments', label: 'Investments' },
  { to: '/bills', label: 'Bills' },
  { to: '/settings', label: 'Settings' },
];

/**
 * Authenticated app chrome: a persistent sidebar nav with a link to every
 * main section, a header carrying the existing ThemeToggle, and an
 * <Outlet/> for the routed page. Only mounted for authenticated users
 * (the protected route branch wraps this in <RequireAuth/>).
 */
export function Layout() {
  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <nav
        aria-label="Main navigation"
        className="border-border bg-card w-64 shrink-0 border-r p-4"
      >
        <div className="text-foreground mb-6 text-lg font-semibold">
          MonetaFox
        </div>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-14 items-center justify-end border-b px-6">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
