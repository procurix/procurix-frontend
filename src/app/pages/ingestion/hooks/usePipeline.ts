import { useCallback, useEffect, useState } from 'react';
import {
  getIngestionDocumentPipeline,
  type IngestionDocumentPipeline,
} from '@/app/services/api/ingestion';
import { useIngestionPoll } from './useIngestionPoll';

function pipelineHasActivity(pipeline: IngestionDocumentPipeline | null): boolean {
  if (!pipeline) return false;
  if (pipeline.jobs.some((job) => job.status === 'queued' || job.status === 'running')) {
    return true;
  }
  return pipeline.chunks.some(
    (chunk) =>
      (chunk.fact_session &&
        ['created', 'drafting'].includes(chunk.fact_session.status)) ||
      (chunk.ner_session &&
        ['created', 'drafting'].includes(chunk.ner_session.status)),
  );
}

export interface UsePipelineResult {
  pipeline: IngestionDocumentPipeline | null;
  isLoading: boolean;
  error: string | null;
  isActive: boolean;
  refresh: () => Promise<void>;
}

export function usePipeline(documentId: string | undefined): UsePipelineResult {
  const [pipeline, setPipeline] = useState<IngestionDocumentPipeline | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(documentId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!documentId) {
      setPipeline(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const next = await getIngestionDocumentPipeline(documentId);
      setPipeline(next);
      setError(null);
    } catch (err) {
      setPipeline(null);
      setError(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isActive = pipelineHasActivity(pipeline);

  useIngestionPoll(refresh, {
    enabled: Boolean(documentId),
    whileActive: () => isActive,
  });

  return {
    pipeline,
    isLoading,
    error,
    isActive,
    refresh,
  };
}
