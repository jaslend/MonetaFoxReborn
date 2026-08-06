import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores';

/**
 * Route guard. Renders the protected subtree (an <Outlet/> for nested
 * routes, or children for ad-hoc use) when `useAuthStore.isAuthenticated`
 * is true; otherwise redirects to `/login`.
 *
 * Phase 2 swaps the seam behind this guard for real session logic without
 * changing its surface — `useAuthStore.isAuthenticated` stays the gate.
 */
export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
