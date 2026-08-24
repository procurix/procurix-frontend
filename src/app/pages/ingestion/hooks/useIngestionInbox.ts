import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getIngestionDocumentPipeline,
  listIngestionDocuments,
  listIngestionJobs,
  type IngestionDocument,
  type IngestionJob,
} from '@/app/services/api/ingestion';
import { useIngestionPoll } from './useIngestionPoll';
import {
  appendActiveJobItems,
  buildInboxItemsFromPipeline,
  sortInboxItems,
  type InboxItem,
} from '@/app/pages/ingestion/inbox/inboxUtils';

export interface UseIngestionInboxResult {
  items: InboxItem[];
  documents: IngestionDocument[];
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;
  refresh: () => Promise<void>;
}

function hasActiveWork(items: InboxItem[], jobs: IngestionJob[]): boolean {
  if (items.some((item) => item.kind.endsWith('_drafting') || item.kind === 'parse_running')) {
    return true;
  }
  return jobs.some(
    (job) =>
      (job.status === 'queued' || job.status === 'running') &&
      ['parse', 'fact_draft', 'ner_draft', 'ner_advance'].includes(job.kind),
  );
}

export function useIngestionInbox(): UseIngestionInboxResult {
  const [documents, setDocuments] = useState<IngestionDocument[]>([]);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [activeJobs, setActiveJobs] = useState<IngestionJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docs, jobs] = await Promise.all([
        listIngestionDocuments(),
        listIngestionJobs(),
      ]);
      setDocuments(docs);

      const runningJobs = jobs.filter(
        (job) => job.status === 'queued' || job.status === 'running',
      );
      setActiveJobs(runningJobs);

      const pipelineResults = await Promise.allSettled(
        docs.map((doc) => getIngestionDocumentPipeline(doc.id)),
      );

      const aggregated: InboxItem[] = [];
      for (const result of pipelineResults) {
        if (result.status === 'fulfilled') {
          aggregated.push(...buildInboxItemsFromPipeline(result.value));
        }
      }

      setItems(appendActiveJobItems(aggregated, docs, runningJobs));
      setError(null);
    } catch (err) {
      setDocuments([]);
      setItems([]);
      setActiveJobs([]);
      setError(err instanceof Error ? err.message : 'Failed to load inbox');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isPolling = useMemo(
    () => hasActiveWork(items, activeJobs),
    [items, activeJobs],
  );

  useIngestionPoll(refresh, {
    enabled: !error,
    whileActive: () => isPolling,
  });

  return {
    items,
    documents,
    isLoading,
    error,
    isPolling,
    refresh,
  };
}
