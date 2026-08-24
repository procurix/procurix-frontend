import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, Loader2 } from 'lucide-react';
import { cn } from '@/app/shared/components/ui/utils';
import type { DocumentListEntry } from '@/app/pages/ingestion/hooks/useIngestionDocuments';
import {
  formatBytes,
  formatDocumentDate,
  resolveDocumentParseStatus,
} from './documentListUtils';
import { StatusBadge } from './StatusBadge';

interface IngestionDocumentListProps {
  entries: DocumentListEntry[];
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;
  selectedDocumentId?: string;
  onRefresh: () => void;
}

export function IngestionDocumentList({
  entries,
  isLoading,
  error,
  isPolling,
  selectedDocumentId,
  onRefresh,
}: IngestionDocumentListProps) {
  const navigate = useNavigate();

  if (isLoading && entries.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
        <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700">No documents yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Upload a spreadsheet above to start the ingestion pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {entries.length} document{entries.length === 1 ? '' : 's'}
          {isPolling && (
            <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Parsing…
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

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {entries.map(({ document, parseJob, chunkCount }) => {
          const { status, label } = resolveDocumentParseStatus(
            parseJob?.status,
            chunkCount,
          );
          const isSelected = document.id === selectedDocumentId;

          return (
            <li key={document.id}>
              <button
                type="button"
                onClick={() => navigate(`/ingestion/documents/${document.id}`)}
                className={cn(
                  'flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                  isSelected && 'bg-blue-50 hover:bg-blue-50',
                )}
              >
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{document.filename}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatBytes(document.size_bytes)} · {formatDocumentDate(document.created_at)}
                  </p>
                  {parseJob?.status === 'failed' && parseJob.error && (
                    <p className="mt-1 truncate text-xs text-red-600">{parseJob.error}</p>
                  )}
                </div>
                <StatusBadge status={status} label={label} />
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
