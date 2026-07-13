import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cpu, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';

const MIN_PASSWORD_LENGTH = 8;

// Where the recovery link lands. Supabase puts the recovery token in the URL
// and the client (detectSessionInUrl) trades it for a session, which arrives as
// a PASSWORD_RECOVERY event. Until that lands we cannot tell "still parsing the
// URL" apart from "link is bad", so we hold a pending state and let AuthContext
// settle before deciding. This route is deliberately public: the recovery
// session makes the user technically authenticated, but routing them through
// AuthGuard would risk a redirect race before the session is detected.
type LinkState = 'pending' | 'valid' | 'invalid';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, isLoading, updatePassword } = useAuth();
  const [linkState, setLinkState] = useState<LinkState>('pending');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setLinkState('valid');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Deciding "invalid" is the delicate part. detectSessionInUrl exchanges the
  // recovery token asynchronously, and getSession() can resolve to null before
  // that lands — so `!isLoading && !session` does NOT mean the link is bad, and
  // treating it that way flashes "expired" on a perfectly good link.
  //
  // Supabase strips the token from the URL once it consumes it, so a token still
  // sitting in the URL means the exchange is in flight: stay pending and let the
  // PASSWORD_RECOVERY event above resolve us. Only when there is no token and no
  // session is the link genuinely dead.
  useEffect(() => {
    if (isLoading || linkState === 'valid') return;
    if (session) {
      setLinkState('valid');
      return;
    }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    // An explicit error in the URL (expired/already-used token) is authoritative.
    if (hash.get('error') || query.get('error')) {
      setLinkState('invalid');
      return;
    }
    const exchangePending =
      hash.has('access_token') || query.has('code') || query.has('token_hash');
    if (!exchangePending) setLinkState('invalid');
  }, [isLoading, session, linkState]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Password updated.');
      navigate('/portal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-slate-900">
          <div className="rounded-lg bg-blue-600 p-1.5 text-white">
            <Cpu className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Procurix</span>
        </Link>
        <div className="rounded-xl bg-white p-8 shadow-md">
          {linkState === 'pending' ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying your link…
            </div>
          ) : linkState === 'invalid' ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <TriangleAlert className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-slate-900">This link has expired</h1>
              <p className="mt-2 text-sm text-slate-600">
                Password reset links can only be used once and expire after an hour. Request a new one to continue.
              </p>
              <Link
                to="/forgot-password"
                className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
              <p className="mt-1 text-sm text-slate-600">
                Must be at least {MIN_PASSWORD_LENGTH} characters.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">New password</span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Confirm new password</span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || !password || !confirm}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
