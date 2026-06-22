import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

// Wraps a protected route. Three states:
//   - AuthContext is still resolving the initial session → spinner so we
//     don't briefly flash the redirect-to-login.
//   - No session → redirect to /login with the attempted URL preserved
//     in state so the login page can route back here after success
//     (currently the login page just navigates to /portal; if we ever want
//     deep-link return, that's where to read it).
//   - Authenticated → render the wrapped page.

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
