import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePipeline } from '@/app/pages/ingestion/hooks/usePipeline';
import { DocumentPipelineView } from '@/app/pages/ingestion/components/DocumentPipelineView';
import type { ChunkFlowTab } from '@/app/pages/ingestion/documentWorkspaceUtils';

function parseTab(value: string | null): ChunkFlowTab | undefined {
  if (value === 'table' || value === 'facts' || value === 'terms') return value;
  return undefined;
}

export function IngestionDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const focusChunkId = searchParams.get('chunk');
  const focusTab = parseTab(searchParams.get('tab'));

  const { pipeline, isLoading, error, isActive, refresh } = usePipeline(documentId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link to="/ingestion/documents" className="text-blue-600 hover:underline">
          Documents
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-700">{documentId?.slice(0, 12)}…</span>
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </span>
        )}
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        {pipeline?.document.filename ?? 'Document workspace'}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Select a table chunk, commit it, review facts against the source table, then map terms
        to your vocabulary.
      </p>

      {isLoading && !pipeline && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pipeline…
        </div>
      )}

      {error && (
        <p className="mt-6 text-sm text-red-700">{error}</p>
      )}

      {pipeline && !error && (
        <>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Chunks" value={pipeline.totals.chunks ?? pipeline.chunks.length} />
            <Stat label="Committed" value={pipeline.totals.chunks_committed ?? 0} />
            <Stat label="Facts" value={pipeline.totals.facts ?? 0} />
            <Stat label="Mentions" value={pipeline.totals.mentions ?? 0} />
          </dl>

          <DocumentPipelineView
            pipeline={pipeline}
            focusChunkId={focusChunkId}
            focusTab={focusTab}
            onRefresh={refresh}
          />
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
