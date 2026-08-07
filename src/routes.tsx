import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/components/RequireAuth';
import { Layout } from '@/components/Layout';
import { AccountsPage } from '@/pages/AccountsPage';
import { BillsPage } from '@/pages/BillsPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InvestmentsPage } from '@/pages/InvestmentsPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ScheduledPage } from '@/pages/ScheduledPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';

/**
 * Route map for the app shell. The caller (App.tsx, or a MemoryRouter in
 * tests) supplies the <Router>; this component only renders a <Routes>
 * element so route state is injectable from outside.
 *
 * - `/login` — public route, renders the stub login screen.
 * - `/` + all sections — protected branch. `RequireAuth` renders the
 *   `Layout` as the parent element's outlet, and each section page is a
 *   child route. Unauthenticated users are redirected to `/login` by
 *   `RequireAuth` before the Layout/nav ever mounts.
 * - `*` — catch-all → `NotFoundPage`.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="scheduled" element={<ScheduledPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
