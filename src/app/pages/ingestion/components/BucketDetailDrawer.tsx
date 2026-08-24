import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CatalogBucket, CatalogBucketLink, ChunkTableContent } from '@/app/services/api/ingestion';
import { getChunkContent, getMentionTrace } from '@/app/services/api/ingestion';
import { useCatalogBucket } from '@/app/pages/ingestion/hooks/useCatalogBucket';
import { buildDocumentWorkspaceHref } from '@/app/pages/ingestion/inbox/inboxUtils';
import { chunkDisplayTitle } from '@/app/pages/ingestion/components/chunkUtils';
import {
  computeMentionSourceHighlight,
  hasTableHighlight,
  type FactEvidenceItem,
} from '@/app/pages/ingestion/components/evidenceHighlightUtils';
import { EditableTableGrid } from '@/app/pages/ingestion/components/EditableTableGrid';
import { Button } from '@/app/shared/components/ui/button';
import { cn } from '@/app/shared/components/ui/utils';

interface BucketDetailDrawerProps {
  bucketSummary: CatalogBucket | null;
  onClose: () => void;
}

type DocumentGroup = {
  documentId: string;
  documentFilename: string;
  links: CatalogBucketLink[];
};

export function BucketDetailDrawer({ bucketSummary, onClose }: BucketDetailDrawerProps) {
  const bucketId = bucketSummary?.id ?? null;
  const { bucket, isLoading, error } = useCatalogBucket(bucketId, Boolean(bucketId));
  const [selectedLink, setSelectedLink] = useState<CatalogBucketLink | null>(null);
  const [tableContent, setTableContent] = useState<ChunkTableContent | null>(null);
  const [evidence, setEvidence] = useState<FactEvidenceItem[] | undefined>(undefined);
  const [chunkTitle, setChunkTitle] = useState<string>('');
  const [documentFilename, setDocumentFilename] = useState<string>('');
  const [factClaim, setFactClaim] = useState<string>('');
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedLink(null);
    setTableContent(null);
    setEvidence(undefined);
    setEvidenceError(null);
  }, [bucketId]);

  const documentGroups = useMemo(() => groupLinksByDocument(bucket?.linked_mentions ?? []), [bucket]);

  const loadEvidence = useCallback(async (link: CatalogBucketLink) => {
    if (!link.chunk_id || !link.mention_id) {
      setEvidenceError('This mention is not linked to a source table.');
      return;
    }

    setSelectedLink(link);
    setEvidenceLoading(true);
    setEvidenceError(null);
    setTableContent(null);

    try {
      const [trace, content] = await Promise.all([
        getMentionTrace(link.mention_id),
        getChunkContent(link.chunk_id),
      ]);

      const fact = trace.fact as Record<string, unknown> | null;
      const chunk = trace.chunk as Record<string, unknown> | null;
      const document = trace.document as Record<string, unknown> | null;

      setEvidence(Array.isArray(fact?.evidence) ? (fact.evidence as FactEvidenceItem[]) : undefined);
      setFactClaim(String(fact?.claim ?? link.fact_claim ?? ''));
      setChunkTitle(
        chunkDisplayTitle(
          chunk?.metadata as Record<string, unknown> | undefined,
          link.chunk_id,
        ),
      );
      setDocumentFilename(
        String(document?.filename ?? link.document_filename ?? 'Unknown document'),
      );
      setTableContent(content);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Failed to load source evidence');
      setTableContent(null);
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  const highlight = useMemo(() => {
    if (!selectedLink?.chunk_id || !tableContent) return null;
    return computeMentionSourceHighlight(
      evidence,
      selectedLink.raw_text,
      tableContent,
      selectedLink.chunk_id,
      selectedLink.entity_kind,
    );
  }, [evidence, selectedLink, tableContent]);

  const activeHighlight = hasTableHighlight(highlight) ? highlight : null;

  if (!bucketSummary) return null;

  const detail = bucket ?? bucketSummary;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30"
        aria-label="Close bucket detail"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Bucket sources
            </p>
            <p className="truncate text-lg font-semibold text-slate-900">{detail.canonical_label}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {detail.bucket_kind}
              {(detail.labels ?? []).length > 0 &&
                ` · ${(detail.labels ?? []).map((l) => l.label).join(', ')}`}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && !bucket && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading linked sources…
            </div>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}

          {!selectedLink && !isLoading && !error && (
            <SourceList
              groups={documentGroups}
              onSelect={(link) => void loadEvidence(link)}
            />
          )}

          {selectedLink && (
            <EvidenceView
              link={selectedLink}
              documentFilename={documentFilename}
              chunkTitle={chunkTitle}
              factClaim={factClaim}
              tableContent={tableContent}
              highlight={activeHighlight}
              isLoading={evidenceLoading}
              error={evidenceError}
              onBack={() => {
                setSelectedLink(null);
                setTableContent(null);
                setEvidenceError(null);
              }}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function SourceList({
  groups,
  onSelect,
}: {
  groups: DocumentGroup[];
  onSelect: (link: CatalogBucketLink) => void;
}) {
  if (!groups.length) {
    return (
      <p className="text-sm text-slate-500">
        No linked documents yet — complete NER persist on a document to attach sources.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Select a source to view the full spreadsheet table it came from.
      </p>
      {groups.map((group) => (
        <section key={group.documentId}>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{group.documentFilename}</h3>
          <ul className="space-y-2">
            {group.links.map((link) => (
              <li key={link.mention_id}>
                <button
                  type="button"
                  onClick={() => onSelect(link)}
                  disabled={!link.chunk_id}
                  className={cn(
                    'w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40',
                    !link.chunk_id && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <p className="text-sm font-medium text-slate-900">
                    “{link.raw_text}”
                    {link.entity_kind && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {link.entity_kind}
                      </span>
                    )}
                  </p>
                  {link.fact_claim && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{link.fact_claim}</p>
                  )}
                  <p className="mt-2 text-xs font-medium text-blue-700">
                    {link.chunk_id ? 'View in table →' : 'No table link'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EvidenceView({
  link,
  documentFilename,
  chunkTitle,
  factClaim,
  tableContent,
  highlight,
  isLoading,
  error,
  onBack,
}: {
  link: CatalogBucketLink;
  documentFilename: string;
  chunkTitle: string;
  factClaim: string;
  tableContent: ChunkTableContent | null;
  highlight: ReturnType<typeof computeMentionSourceHighlight> | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const showingHighlight = hasTableHighlight(highlight);

  return (
    <div className="space-y-4">
      <Button type="button" size="sm" variant="ghost" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        All sources
      </Button>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-900">{documentFilename}</p>
            <p className="text-xs text-slate-500">{chunkTitle}</p>
          </div>
          {link.document_id && link.chunk_id && (
            <Link
              to={buildDocumentWorkspaceHref(link.document_id, link.chunk_id, 'table')}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Open in workspace
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {factClaim && (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Fact:</span> “{factClaim}”
          </p>
        )}
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-medium text-slate-500">Mention:</span> “{link.raw_text}”
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading source table…
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {tableContent && !isLoading && (
        <>
          <p className="text-xs text-slate-500">
            {showingHighlight
              ? 'Matching cells are highlighted in the table below.'
              : 'Source table for this chunk — review the full table alongside the fact and mention above.'}
          </p>
          <EditableTableGrid
            content={tableContent}
            editable={false}
            onChange={() => {}}
            highlight={showingHighlight ? highlight : null}
          />
        </>
      )}
    </div>
  );
}

function groupLinksByDocument(links: CatalogBucketLink[]): DocumentGroup[] {
  const byDocument = new Map<string, DocumentGroup>();

  for (const link of links) {
    const documentId = link.document_id ?? 'unknown';
    const existing = byDocument.get(documentId);
    if (existing) {
      existing.links.push(link);
      continue;
    }
    byDocument.set(documentId, {
      documentId,
      documentFilename: link.document_filename ?? `Document ${documentId.slice(0, 8)}…`,
      links: [link],
    });
  }

  return [...byDocument.values()].sort((a, b) =>
    a.documentFilename.localeCompare(b.documentFilename),
  );
}
