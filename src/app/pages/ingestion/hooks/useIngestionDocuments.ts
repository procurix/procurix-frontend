import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchChunkCountForDocument,
  getLatestParseJobsByDocument,
  isParseJobActive,
  listIngestionDocuments,
  listIngestionJobs,
  type IngestionDocument,
  type IngestionJob,
} from '@/app/services/api/ingestion';
import { useIngestionPoll } from './useIngestionPoll';

export interface DocumentListEntry {
  document: IngestionDocument;
  parseJob: IngestionJob | undefined;
  chunkCount: number | null;
}

export interface UseIngestionDocumentsResult {
  entries: DocumentListEntry[];
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;
  refresh: () => Promise<void>;
}

export function useIngestionDocuments(): UseIngestionDocumentsResult {
  const [documents, setDocuments] = useState<IngestionDocument[]>([]);
  const [parseJobsByDocument, setParseJobsByDocument] = useState<Map<string, IngestionJob>>(
    new Map(),
  );
  const [chunkCounts, setChunkCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chunkCountsRef = useRef(chunkCounts);
  chunkCountsRef.current = chunkCounts;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docs, parseJobs] = await Promise.all([
        listIngestionDocuments(),
        listIngestionJobs({ kind: 'parse' }),
      ]);

      const latestJobs = getLatestParseJobsByDocument(parseJobs);
      setDocuments(docs);
      setParseJobsByDocument(latestJobs);

      const counts = new Map(chunkCountsRef.current);
      const tasks: Array<Promise<void>> = [];
      for (const [documentId, job] of latestJobs) {
        if (job.status !== 'succeeded' || counts.has(documentId)) continue;
        tasks.push(
          fetchChunkCountForDocument(documentId)
            .then((count) => {
              counts.set(documentId, count);
            })
            .catch(() => {
              counts.set(documentId, 0);
            }),
        );
      }
      await Promise.all(tasks);
      setChunkCounts(counts);
      setError(null);
    } catch (err) {
      setDocuments([]);
      setParseJobsByDocument(new Map());
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isPolling = useMemo(
    () => [...parseJobsByDocument.values()].some(isParseJobActive),
    [parseJobsByDocument],
  );

  useIngestionPoll(refresh, {
    enabled: !error,
    whileActive: () => isPolling,
  });

  const entries = useMemo<DocumentListEntry[]>(() => {
    return documents.map((document) => ({
      document,
      parseJob: parseJobsByDocument.get(document.id),
      chunkCount: chunkCounts.get(document.id) ?? null,
    }));
  }, [documents, parseJobsByDocument, chunkCounts]);

  return {
    entries,
    isLoading,
    error,
    isPolling,
    refresh,
  };
}
