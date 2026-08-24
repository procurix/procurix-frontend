import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { useIngestionInbox } from '@/app/pages/ingestion/hooks/useIngestionInbox';
import { InboxQueue } from '@/app/pages/ingestion/components/InboxQueue';
import { useIngestionHealth } from '@/app/pages/ingestion/hooks/useIngestionHealth';

export function IngestionInboxPage() {
  const { isLoading: healthLoading, error: healthError, health } = useIngestionHealth();
  const { items, isLoading, error, isPolling, refresh } = useIngestionInbox();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Review inbox</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Everything that needs your attention across all documents — table commits,
        fact batches, and NER review gates — sorted by urgency.
      </p>

      {healthLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading backend status…
        </div>
      ) : healthError ? (
        <p className="mt-6 text-sm text-red-700">
          Connect the ingestion backend to see pending review items.
        </p>
      ) : health?.ok ? (
        <>
          <InboxQueue
            items={items}
            isLoading={isLoading}
            error={error}
            isPolling={isPolling}
            onRefresh={() => void refresh()}
          />

          {!isLoading && !error && items.length === 0 && (
            <div className="mt-6">
              <Button asChild variant="outline" size="sm">
                <Link to="/ingestion/documents">
                  Go to documents
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
