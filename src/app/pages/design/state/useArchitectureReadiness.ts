import { useCallback, useEffect, useState } from 'react';
import {
  getArchitectureCompletionReadiness,
  type ArchitectureCompletionReadiness,
} from '@/app/services/api';

// Lightweight readiness fetch for the Design page. Used to:
//   1. Disable Generate Subsystems when the architecture has blockers or no
//      connections, so the user doesn't click a button that will 409.
//   2. Surface the reasons in a tooltip / inline hint.
// The embedded ArchitecturePage also fetches readiness for its own button;
// we listen on 'design:updated' to refetch whenever the analyzer reruns.

export interface UseArchitectureReadiness {
  readiness: ArchitectureCompletionReadiness | null;
  refresh: () => Promise<void>;
}

export function useArchitectureReadiness(sessionId: string | null): UseArchitectureReadiness {
  const [readiness, setReadiness] = useState<ArchitectureCompletionReadiness | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await getArchitectureCompletionReadiness(sessionId);
      setReadiness(r);
    } catch {
      // Soft failure — leave previous snapshot in place.
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener('design:updated', handler);
    return () => window.removeEventListener('design:updated', handler);
  }, [refresh]);

  return { readiness, refresh };
}
