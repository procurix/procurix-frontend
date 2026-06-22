import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

// Renders a non-dismissable modal when the fetch interceptor signals an
// expired session. The interceptor fires window.dispatchEvent(new Event(
// 'auth:session-expired')) after a failed silent refresh; we listen for
// that and lock the UI until the user clicks through.

export function SessionExpiredModal() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onExpired = () => setOpen(true);
    window.addEventListener('auth:session-expired', onExpired);
    return () => window.removeEventListener('auth:session-expired', onExpired);
  }, []);

  if (!open) return null;

  const goToLanding = async () => {
    await signOut();
    setOpen(false);
    navigate('/');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900">Session expired</h3>
            <p className="mt-1 text-sm text-slate-600">
              You've been signed out for security. Sign in again to keep working.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void goToLanding()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to landing page
          </button>
        </div>
      </div>
    </div>
  );
}
