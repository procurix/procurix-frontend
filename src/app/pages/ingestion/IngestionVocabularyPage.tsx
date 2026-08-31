import { useIngestionHealth } from '@/app/pages/ingestion/hooks/useIngestionHealth';
import { VocabularyBrowser } from '@/app/pages/ingestion/components/VocabularyBrowser';

export function IngestionVocabularyPage() {
  const { isLoading, error, capabilities, health } = useIngestionHealth();
  const nerReady = capabilities?.ner_schema ?? false;
  const enabled = Boolean(health?.ok && nerReady && !error);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Vocabulary catalogue</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Browse org-wide term and metric buckets. Click a bucket to see linked
        documents and the source table each term came from.
      </p>

      {!isLoading && !nerReady && !error && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          NER schema is not ready on the backend. Complete document ingestion through
          the persist step, or check backend startup logs.
        </p>
      )}

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-700">Connect the backend to browse vocabulary.</p>
      ) : (
        <VocabularyBrowser enabled={enabled} />
      )}
    </section>
  );
}
