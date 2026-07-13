import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cpu, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) {
        toast.error(error.message);
        return;
      }
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
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome back.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
