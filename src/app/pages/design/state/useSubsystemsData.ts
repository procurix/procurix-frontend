import { useCallback, useRef, useState } from 'react';
import type { SubsystemSummary } from '@/app/services/api';

// Design no longer generates design_evolution subsystems or connections.
// This hook is a stub so existing panel types keep compiling.

type FetchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseSubsystemsData {
  status: FetchStatus;
  error: string | null;
  subsystems: SubsystemSummary[];
  isGenerating: boolean;
  isStale: boolean;
  generate: () => Promise<void>;
  reload: () => Promise<void>;
  markStaleFromArchitecture: () => void;
}

export function useSubsystemsData(_sessionId: string | null): UseSubsystemsData {
  const [status] = useState<FetchStatus>('idle');
  const [error] = useState<string | null>(null);
  const [subsystems] = useState<SubsystemSummary[]>([]);
  const mountedRef = useRef(true);

  const noop = useCallback(async () => {
    if (!mountedRef.current) return;
  }, []);

  return {
    status,
    error,
    subsystems,
    isGenerating: false,
    isStale: false,
    generate: noop,
    reload: noop,
    markStaleFromArchitecture: () => undefined,
  };
}
