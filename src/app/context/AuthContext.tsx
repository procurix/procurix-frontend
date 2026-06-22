import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/app/lib/supabase';

// Auth state lives here. Wraps the Supabase client so the rest of the app
// reads a stable shape and gets re-rendered on every auth event (sign in,
// sign out, token refresh). The fetch interceptor in services/api/legacy.ts
// reads the current session directly from supabase.auth rather than from
// this context — the two stay in sync because Supabase is the single
// source of truth.

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // isLoading is true until the initial getSession() resolves — components
  // that gate on auth should render a loading state until then so they
  // don't flicker between "logged out" and "logged in".
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUpWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error };
    },
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
