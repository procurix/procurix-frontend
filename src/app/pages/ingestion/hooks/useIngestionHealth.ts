import { useCallback, useEffect, useState } from 'react';
import {
  getIngestionHealth,
  type IngestionCapabilities,
  type IngestionHealthResponse,
} from '@/app/services/api/ingestion';

export interface IngestionHealthState {
  health: IngestionHealthResponse | null;
  capabilities: IngestionCapabilities | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useIngestionHealth(): IngestionHealthState {
  const [health, setHealth] = useState<IngestionHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await getIngestionHealth();
      setHealth(next);
      setError(null);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Failed to reach ingestion backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    health,
    capabilities: health?.capabilities ?? null,
    isLoading,
    error,
    refresh,
  };
}
