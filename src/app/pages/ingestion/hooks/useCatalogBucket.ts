import { useCallback, useEffect, useState } from 'react';
import { getCatalogBucket, type CatalogBucketDetail } from '@/app/services/api/ingestion';

export function useCatalogBucket(bucketId: string | null, enabled = true) {
  const [bucket, setBucket] = useState<CatalogBucketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !bucketId) {
      setBucket(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    try {
      setBucket(await getCatalogBucket(bucketId));
      setError(null);
    } catch (err) {
      setBucket(null);
      setError(err instanceof Error ? err.message : 'Failed to load bucket');
    } finally {
      setIsLoading(false);
    }
  }, [bucketId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { bucket, isLoading, error, refresh };
}
