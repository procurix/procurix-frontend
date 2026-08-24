import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/app/shared/components/ui/badge';
import { cn } from '@/app/shared/components/ui/utils';
import {
  buildDocumentWorkspaceHref,
  inboxKindLabel,
  type InboxItem,
  type InboxItemKind,
} from '@/app/pages/ingestion/inbox/inboxUtils';

const KIND_STYLES: Record<InboxItemKind, string> = {
  parse_running: 'border-blue-200 bg-blue-50 text-blue-800',
  table_review: 'border-slate-200 bg-slate-50 text-slate-700',
  fact_drafting: 'border-blue-200 bg-blue-50 text-blue-700',
  fact_review: 'border-amber-200 bg-amber-50 text-amber-900',
  fact_commit: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  ner_drafting: 'border-blue-200 bg-blue-50 text-blue-700',
  ner_review: 'border-amber-200 bg-amber-50 text-amber-900',
  ner_advance: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  ner_persist: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

interface InboxQueueProps {
  items: InboxItem[];
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;
  onRefresh: () => void;
}

export function InboxQueue({ items, isLoading, error, isPolling, onRefresh }: InboxQueueProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Scanning documents for pending reviews…
      </div>
    );
  }

  if (error) {
    return (
      <p className="mt-6 text-sm text-red-700">{error}</p>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">All caught up</p>
        <p className="mt-1 text-sm text-slate-500">
          No tables, facts, or NER stages need your attention right now.
        </p>
      </div>
    );
  }

  const actionItems = items.filter((item) => !item.kind.endsWith('_drafting') && item.kind !== 'parse_running');
  const backgroundItems = items.filter((item) => item.kind.endsWith('_drafting') || item.kind === 'parse_running');

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {actionItems.length} item{actionItems.length === 1 ? '' : 's'} need attention
          {isPolling && (
            <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="text-sm text-blue-600 hover:underline"
        >
          Refresh
        </button>
      </div>

      {actionItems.length > 0 && (
        <ul className="space-y-2">
          {actionItems.map((item) => (
            <InboxRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {backgroundItems.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Background work
          </h3>
          <ul className="space-y-2">
            {backgroundItems.map((item) => (
              <InboxRow key={item.id} item={item} muted />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InboxRow({ item, muted }: { item: InboxItem; muted?: boolean }) {
  const href = buildDocumentWorkspaceHref(item.documentId, item.chunkId, item.tab);

  return (
    <li>
      <Link
        to={href}
        className={cn(
          'flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-slate-50',
          muted ? 'border-slate-200 bg-white opacity-80' : 'border-slate-200 bg-white',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">{item.title}</p>
            <Badge variant="outline" className={cn('text-xs', KIND_STYLES[item.kind])}>
              {inboxKindLabel(item.kind)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
          <p className="mt-1 text-xs text-slate-400">
            Updated {new Date(item.updatedAt).toLocaleString()}
          </p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      </Link>
    </li>
  );
}
