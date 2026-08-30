import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { CatalogBucket } from '@/app/services/api/ingestion';
import { useCatalogBuckets, useCatalogSummary } from '@/app/pages/ingestion/hooks/useCatalog';
import { BucketDetailDrawer } from '@/app/pages/ingestion/components/BucketDetailDrawer';
import { Input } from '@/app/shared/components/ui/input';
import { cn } from '@/app/shared/components/ui/utils';

interface VocabularyBrowserProps {
  enabled: boolean;
}

export function VocabularyBrowser({ enabled }: VocabularyBrowserProps) {
  const [kindFilter, setKindFilter] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<CatalogBucket | null>(null);

  const filters = useMemo(
    () => ({ kind: kindFilter || undefined, q: searchQuery || undefined }),
    [kindFilter, searchQuery],
  );

  const { summary, isLoading: summaryLoading, error: summaryError } = useCatalogSummary(enabled);
  const {
    buckets,
    isLoading: bucketsLoading,
    error: bucketsError,
    refresh: refreshBuckets,
  } = useCatalogBuckets(filters, enabled);

  const handleSearch = () => setSearchQuery(searchDraft.trim());

  return (
    <>
      {summary && (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Buckets" value={summary.counts.buckets} detail={`${summary.counts.term_buckets} term · ${summary.counts.metric_buckets} metric`} />
          <Stat label="Mentions" value={summary.counts.linked_mentions} detail={`${summary.counts.linked_documents} documents`} />
          <Stat label="Mappings" value={summary.counts.mappings} />
          <Stat label="Facts linked" value={summary.counts.linked_facts} />
        </dl>
      )}

      {summaryLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading catalogue summary…
        </div>
      )}

      {summaryError && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {summaryError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Kind</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="term">Term</option>
            <option value="metric">Metric</option>
          </select>
        </label>
        <label className="min-w-[200px] flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Search</span>
          <div className="flex gap-2">
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search primary labels or aliases…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </label>
        <button
          type="button"
          onClick={() => void refreshBuckets()}
          className="text-sm text-blue-600 hover:underline"
        >
          Refresh
        </button>
      </div>

      <BucketTable
        buckets={buckets}
        isLoading={bucketsLoading}
        error={bucketsError}
        selectedBucketId={selectedBucket?.id ?? null}
        onSelect={setSelectedBucket}
      />

      <BucketDetailDrawer bucketSummary={selectedBucket} onClose={() => setSelectedBucket(null)} />
    </>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
      {detail && <dd className="mt-0.5 text-xs text-slate-500">{detail}</dd>}
    </div>
  );
}

function BucketTable({
  buckets,
  isLoading,
  error,
  selectedBucketId,
  onSelect,
}: {
  buckets: CatalogBucket[];
  isLoading: boolean;
  error: string | null;
  selectedBucketId: string | null;
  onSelect: (bucket: CatalogBucket) => void;
}) {
  if (isLoading && !buckets.length) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading buckets…
      </div>
    );
  }

  if (error) return <p className="mt-6 text-sm text-red-700">{error}</p>;

  if (!buckets.length) {
    return (
      <p className="mt-6 text-sm text-slate-500">
        No buckets yet — complete NER persist on a document to populate the catalogue.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Kind</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Primary label</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Labels</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Sources</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {buckets.map((bucket) => {
            const selected = selectedBucketId === bucket.id;
            const hasSources = bucket.linked_document_count > 0;
            return (
              <tr
                key={bucket.id}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-slate-50',
                  selected && 'bg-blue-50/60',
                )}
                onClick={() => onSelect(bucket)}
              >
                <td className="px-3 py-2 text-slate-700">{bucket.bucket_kind}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{bucket.canonical_label}</td>
                <td className="px-3 py-2 text-slate-600">
                  {(bucket.labels ?? []).map((l) => l.label).join(', ') || '—'}
                </td>
                <td className="px-3 py-2 text-slate-600">{bucket.status}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {hasSources ? (
                    <span className="font-medium text-blue-700">
                      {bucket.linked_document_count} doc
                      {bucket.linked_document_count === 1 ? '' : 's'} · view sources →
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
