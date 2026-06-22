import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  confirmAllConnections,
  getSubsystems,
  generateSubsystems,
  type SubsystemSummary,
} from '@/app/services/api';

// Subsystem list state for the Design page. Lazy: we don't fetch on mount
// — only when the user clicks Generate (or when an earlier session already
// has subsystems). The 'staleAt' marker tracks when the architecture last
// changed after subsystems were loaded, so we can show a "may be stale"
// warning without auto-regenerating.

type FetchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseSubsystemsData {
  status: FetchStatus;
  error: string | null;
  subsystems: SubsystemSummary[];
  isGenerating: boolean;
  isStale: boolean;
  generate: () => Promise<void>;
  reload: () => Promise<void>;
  /** Called by the architecture-data hook after a re-analyze completes. */
  markStaleFromArchitecture: () => void;
}

export function useSubsystemsData(sessionId: string | null): UseSubsystemsData {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [subsystems, setSubsystems] = useState<SubsystemSummary[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    setStatus('loading');
    setError(null);
    try {
      const resp = await getSubsystems(sessionId);
      if (!mountedRef.current) return;
      setSubsystems(resp.subsystems ?? []);
      setStatus('ready');
      setIsStale(false);
    } catch (err) {
      if (!mountedRef.current) return;
      // 404/empty is fine — just means subsystems haven't been generated yet.
      setSubsystems([]);
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Failed to load subsystems');
    }
  }, [sessionId]);

  // Try to load any pre-existing subsystems once per session.
  useEffect(() => {
    if (!sessionId) return;
    void reload();
  }, [reload, sessionId]);

  const generate = useCallback(async () => {
    if (!sessionId || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      // /subsystems/generate requires FSM >= CONNECTIONS_BUILT. By the time
      // the user can click this button, readiness already reports
      // can_complete = true (we gate the button on it). But the FSM advance
      // only happens on /connections/confirm-all, not on per-net confirms.
      // So defensively call confirmAllConnections — it's idempotent for
      // already-confirmed nets and just bumps the FSM if needed.
      try {
        await confirmAllConnections(sessionId, null, false);
      } catch (confirmErr) {
        // If the FSM is already at CONNECTIONS_BUILT (or beyond), the
        // confirm-all call is a no-op and may succeed or return a benign
        // error; either way we proceed to generate. Only bail on explicit
        // 422 (no connections exist) or 409 (still has blockers).
        const msg = confirmErr instanceof Error ? confirmErr.message : '';
        if (msg.includes('422')) {
          throw new Error('No architecture connections exist yet. Regenerate the architecture first.');
        }
        if (msg.includes('409')) {
          throw new Error('Architecture has unresolved blockers. Resolve the review queue items in the canvas, then try again.');
        }
        // Any other error — log but proceed; the subsequent generate call
        // will surface a real failure if the FSM truly isn't ready.
        console.warn('[design] confirmAllConnections returned an error; proceeding to generate', confirmErr);
      }

      const resp = await generateSubsystems(sessionId);
      if (!mountedRef.current) return;
      setSubsystems(resp.subsystems ?? []);
      setStatus('ready');
      setIsStale(false);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to generate subsystems';
      setError(msg);
      toast.error(msg);
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [isGenerating, sessionId]);

  const markStaleFromArchitecture = useCallback(() => {
    if (subsystems.length > 0) setIsStale(true);
  }, [subsystems.length]);

  return {
    status,
    error,
    subsystems,
    isGenerating,
    isStale,
    generate,
    reload,
    markStaleFromArchitecture,
  };
}
