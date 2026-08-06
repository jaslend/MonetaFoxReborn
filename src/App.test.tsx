import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { useAuthStore } from '@/stores';

/**
 * Shell contract tests for Phase 3b. These do NOT exercise the Phase 0 demo
 * counter (deleted); they pin the protected-route seam: unauthenticated users
 * see Login, authenticated users see the Layout + the routed section page.
 */
describe('AppRoutes shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
  });

  it('shows the Login page (with "Sign in") when unauthenticated at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/welcome back to monetafox/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Dashboard/i, level: 1 }),
    ).not.toBeInTheDocument();
  });

  it('renders the Dashboard and nav when authenticated at /', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /Dashboard/i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Transactions' }),
    ).toBeInTheDocument();
  });

  it('dev Sign in button authenticates and shows the Dashboard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('dev-sign-in'));

    expect(
      screen.getByRole('heading', { name: /Dashboard/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it('renders NotFound for an unknown path', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /Not Found/i, level: 1 }),
    ).toBeInTheDocument();
  });
});
