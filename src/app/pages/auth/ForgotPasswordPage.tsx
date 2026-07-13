import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/context/AuthContext';

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await sendPasswordReset(email.trim());
      if (error) {
        toast.error(error.message);
        return;
      }
      // Show the same confirmation whether or not the address has an account —
      // a differing response would let anyone probe for registered emails.
      setSent(true);
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
          {sent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-slate-900">Check your email</h1>
              <p className="mt-2 text-sm text-slate-600">
                If an account exists for <span className="font-medium text-slate-900">{email.trim()}</span>, we&apos;ve
                sent a link to reset your password. The link expires in one hour.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
              <p className="mt-1 text-sm text-slate-600">
                Enter your email and we&apos;ll send you a link to choose a new one.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Send reset link
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
