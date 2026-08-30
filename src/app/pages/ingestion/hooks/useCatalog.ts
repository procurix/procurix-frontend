import { useCallback, useEffect, useState } from 'react';
import {
  getCatalogSummary,
  getMentionTrace,
  listCatalogBuckets,
  listCatalogMentions,
  type CatalogBucket,
  type CatalogMention,
  type CatalogSummary,
  type MentionTrace,
} from '@/app/services/api/ingestion';

export function useCatalogSummary(enabled = true) {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      setSummary(await getCatalogSummary());
      setError(null);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'Failed to load catalogue summary');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, isLoading, error, refresh };
}

export interface CatalogFilters {
  kind?: string;
  q?: string;
}

export function useCatalogBuckets(filters: CatalogFilters, enabled = true) {
  const [buckets, setBuckets] = useState<CatalogBucket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      setBuckets(
        await listCatalogBuckets({
          kind: filters.kind || undefined,
          q: filters.q?.trim() || undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setBuckets([]);
      setError(err instanceof Error ? err.message : 'Failed to load buckets');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, filters.kind, filters.q]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { buckets, isLoading, error, refresh };
}

export function useCatalogMentions(filters: CatalogFilters, enabled = true) {
  const [mentions, setMentions] = useState<CatalogMention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      setMentions(
        await listCatalogMentions({
          entity_kind: filters.kind || undefined,
          q: filters.q?.trim() || undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setMentions([]);
      setError(err instanceof Error ? err.message : 'Failed to load mentions');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, filters.kind, filters.q]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { mentions, isLoading, error, refresh };
}

export function useMentionTrace(mentionId: string | null) {
  const [trace, setTrace] = useState<MentionTrace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mentionId) {
      setTrace(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void getMentionTrace(mentionId)
      .then((result) => {
        if (!cancelled) setTrace(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setTrace(null);
          setError(err instanceof Error ? err.message : 'Failed to load trace');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mentionId]);

  return { trace, isLoading, error };
}
