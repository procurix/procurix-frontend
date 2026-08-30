import { Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MentionTrace } from '@/app/services/api/ingestion';
import { buildDocumentWorkspaceHref } from '@/app/pages/ingestion/documentWorkspaceUtils';
import { Button } from '@/app/shared/components/ui/button';
import { cn } from '@/app/shared/components/ui/utils';

interface TracePanelProps {
  mentionId: string | null;
  trace: MentionTrace | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

export function TracePanel({
  mentionId,
  trace,
  isLoading,
  error,
  onClose,
}: TracePanelProps) {
  if (!mentionId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30"
        aria-label="Close trace panel"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lineage trace
            </p>
            <p className="font-mono text-sm text-slate-800">{mentionId.slice(0, 16)}…</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading trace…
            </div>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}

          {trace && !isLoading && (
            <ol className="space-y-0">
              <TraceStep label="Document" active>
                {trace.document ? (
                  <>
                    <p className="font-medium text-slate-900">
                      {String(trace.document.filename ?? 'Unknown document')}
                    </p>
                    {trace.document.id && (
                      <Link
                        to={buildDocumentWorkspaceHref(String(trace.document.id))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Open document workspace
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Not linked</p>
                )}
              </TraceStep>

              <TraceStep label="Chunk">
                {trace.chunk ? (
                  <p className="text-sm text-slate-800">
                    {String(
                      (trace.chunk.metadata as Record<string, unknown> | undefined)?.title ??
                        trace.chunk.id ??
                        'Chunk',
                    )}
                    <span className="ml-2 text-xs text-slate-500">
                      {String(trace.chunk.status ?? '')}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Not linked</p>
                )}
              </TraceStep>

              <TraceStep label="Fact">
                {trace.fact ? (
                  <p className="text-sm text-slate-800">“{String(trace.fact.claim ?? '')}”</p>
                ) : (
                  <p className="text-sm text-slate-500">Not linked</p>
                )}
              </TraceStep>

              <TraceStep label="Mention">
                {trace.mention ? (
                  <>
                    <p className="font-medium text-slate-900">
                      “{String(trace.mention.raw_text ?? '')}”
                    </p>
                    <p className="text-xs text-slate-500">
                      {String(trace.mention.source_ref ?? '')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Not found</p>
                )}
              </TraceStep>

              <TraceStep label="Mapping" isLast>
                {trace.mapping ? (
                  <p className="text-sm text-slate-800">
                    {String(trace.mapping.decision ?? '')} · {String(trace.mapping.status ?? '')}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Not linked</p>
                )}
              </TraceStep>

              {trace.bucket && (
                <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    Primary label
                  </p>
                  <p className="mt-1 font-medium text-teal-900">
                    {String(trace.bucket.canonical_label ?? '')}
                  </p>
                  <p className="text-xs text-teal-700">
                    {String(trace.bucket.bucket_kind ?? '')}
                    {trace.bucket.labels?.length
                      ? ` · ${trace.bucket.labels.map((l) => l.label).join(', ')}`
                      : ''}
                  </p>
                </div>
              )}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

function TraceStep({
  label,
  children,
  active,
  isLast,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  isLast?: boolean;
}) {
  return (
    <li className="relative pb-6 pl-6">
      {!isLast && (
        <span className="absolute bottom-0 left-[7px] top-5 w-px bg-slate-200" aria-hidden />
      )}
      <span
        className={cn(
          'absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white',
          active ? 'border-blue-500' : 'border-slate-300',
        )}
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
    </li>
  );
}
