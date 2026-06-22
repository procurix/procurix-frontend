import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cpu, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/context/AuthContext';

// Password rules — kept aligned with Supabase's default min (≥8 chars) and
// adds a "letter + number" smell test. Email-verification is intentionally
// not required for v1 (Supabase setting in dashboard).

function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('At least 8 characters.');
  if (!/[A-Za-z]/.test(pw)) issues.push('Contains a letter.');
  if (!/[0-9]/.test(pw)) issues.push('Contains a number.');
  return issues;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUpWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pwIssues = passwordIssues(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = email.includes('@') && pwIssues.length === 0 && !mismatch && confirm.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await signUpWithPassword(email.trim(), password);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Account created');
      // Supabase auto-signs the user in on signUp; redirect to portal.
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
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-600">Get started in less than a minute.</p>

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
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {password.length > 0 && pwIssues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                  {pwIssues.map((i) => <li key={i}>{i}</li>)}
                </ul>
              )}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {mismatch && (
                <p className="mt-1 text-xs text-amber-700">Passwords don't match.</p>
              )}
            </label>
            <button
              type="submit"
              disabled={!ready || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
