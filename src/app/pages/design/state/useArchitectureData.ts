import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeConnections } from '@/app/services/api';

// Auto-rerender controller for the Design page. We don't fetch architecture
// data here — the embedded ArchitecturePage owns that. This hook only
// triggers analyzeConnections (debounced or manually) and notifies the rest
// of the page via the global 'design:updated' event so ArchitecturePage
// refetches its snapshot.

type AnalyzeStatus = 'idle' | 'running' | 'error';

export interface UseArchitectureData {
  status: AnalyzeStatus;
  error: string | null;
  isRecomputing: boolean;
  /** Manually re-run the analyzer (bypasses debounce). */
  regenerate: () => Promise<void>;
  /** Mark architecture as needing a re-run. Debounced 1.5s. */
  markStale: () => void;
}

const DEBOUNCE_MS = 1500;

export function useArchitectureData(sessionId: string | null, autoRerun: boolean): UseArchitectureData {
  const [status, setStatus] = useState<AnalyzeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  const runAnalyze = useCallback(async () => {
    if (!sessionId) return;
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }
    runningRef.current = true;
    setStatus('running');
    try {
      await analyzeConnections(sessionId);
      setError(null);
      // Tell embedded ArchitecturePage (and anyone else listening) to refetch.
      window.dispatchEvent(new Event('design:updated'));
      setStatus('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Architecture analyzer failed';
      setError(msg);
      setStatus('error');
    } finally {
      runningRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        setTimeout(() => { void runAnalyze(); }, 0);
      }
    }
  }, [sessionId]);

  const markStale = useCallback(() => {
    if (!autoRerun) return;
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      void runAnalyze();
    }, DEBOUNCE_MS);
  }, [autoRerun, runAnalyze]);

  const regenerate = useCallback(async () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    await runAnalyze();
  }, [runAnalyze]);

  useEffect(() => () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
  }, []);

  return {
    status,
    error,
    isRecomputing: status === 'running',
    regenerate,
    markStale,
  };
}
