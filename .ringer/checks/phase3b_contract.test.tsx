// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 3b (app shell).
// Copied into src/ by the Ringer check, run against the worker's real routes,
// then removed. Runs under the default jsdom environment (RTL). It pins the
// testable seam Phase 2 auth will build on: a routable <AppRoutes/>, a
// RequireAuth guard driven by useAuthStore, a Login route, per-section pages,
// and a persistent nav.

import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, it, expect } from 'vitest';

import { AppRoutes } from '@/routes';
import { useAuthStore } from '@/stores/authStore';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ isAuthenticated: false });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('Phase 3b contract: protected app shell', () => {
  it('redirects an unauthenticated visit to a protected route to the login page', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderAt('/accounts');

    // Login surface is shown...
    expect(screen.queryByText(/sign in|log ?in/i)).not.toBeNull();
    // ...and the protected Accounts heading is NOT.
    expect(screen.queryByRole('heading', { name: /accounts/i })).toBeNull();
  });

  it('renders the section page and persistent nav when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderAt('/accounts');

    // The page for the route renders.
    expect(screen.getByRole('heading', { name: /accounts/i })).toBeTruthy();

    // A persistent nav links to the main sections.
    for (const label of [/dashboard/i, /accounts/i, /transactions/i, /budgets/i, /reports/i, /settings/i]) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('routes to distinct pages per section', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderAt('/transactions');
    expect(screen.getByRole('heading', { name: /transactions/i })).toBeTruthy();
  });

  it('shows a not-found page for an unknown authenticated route', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderAt('/this-route-does-not-exist');
    expect(screen.queryByText(/not found|404/i)).not.toBeNull();
  });
});
