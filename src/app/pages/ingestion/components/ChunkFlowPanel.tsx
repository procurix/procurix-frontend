import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/shared/components/ui/button';
import {
  getChunkContent,
  putChunkContent,
  uncommitIngestionChunk,
  type ChunkTableContent,
  type FactCardDraft,
  type IngestionChunkPipeline,
} from '@/app/services/api/ingestion';
import { commitChunkWithDevMode } from '@/app/services/api/ingestionClient';
import { useIngestionDev } from '@/app/pages/ingestion/state/IngestionDevContext';
import type { ChunkFlowTab } from '@/app/pages/ingestion/documentWorkspaceUtils';
import { cloneTableContent, chunkDisplayTitle } from './chunkUtils';
import { computeEvidenceHighlight, hasTableHighlight } from './evidenceHighlightUtils';
import { EditableTableGrid } from './EditableTableGrid';
import { FactReviewPanel } from './FactReviewPanel';
import { NerReviewPanel } from './NerReviewPanel';

interface ChunkFlowPanelProps {
  chunkPipeline: IngestionChunkPipeline;
  documentId: string;
  focusSection?: ChunkFlowTab;
  onUpdated: () => Promise<void>;
}

export function ChunkFlowPanel({
  chunkPipeline,
  documentId,
  focusSection,
  onUpdated,
}: ChunkFlowPanelProps) {
  const dev = useIngestionDev();
  const { chunk } = chunkPipeline;
  const isCommitted = chunk.status === 'committed';
  const title = chunkDisplayTitle(chunk.metadata, chunk.id);
  const factCount = chunkPipeline.fact_counts.total ?? 0;
  const termsAvailable = isCommitted && (factCount > 0 || dev.mockMode);

  const [content, setContent] = useState<ChunkTableContent | null>(null);
  const [savedContent, setSavedContent] = useState<ChunkTableContent | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isUncommitting, setIsUncommitting] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [activeEvidenceFactId, setActiveEvidenceFactId] = useState<string | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<FactCardDraft['evidence']>(undefined);

  const tableSectionRef = useRef<HTMLElement>(null);
  const factsSectionRef = useRef<HTMLElement>(null);
  const termsSectionRef = useRef<HTMLElement>(null);

  const isDirty =
    content !== null &&
    savedContent !== null &&
    JSON.stringify(content) !== JSON.stringify(savedContent);

  const loadContent = useCallback(async () => {
    setIsLoadingContent(true);
    setContentError(null);
    try {
      const next = await getChunkContent(chunk.id);
      const cloned = cloneTableContent(next);
      setContent(cloned);
      setSavedContent(cloneTableContent(next));
    } catch (err) {
      setContent(null);
      setSavedContent(null);
      setContentError(err instanceof Error ? err.message : 'Failed to load table');
    } finally {
      setIsLoadingContent(false);
    }
  }, [chunk.id]);

  useEffect(() => {
    setActiveEvidenceFactId(null);
    setActiveEvidence(undefined);
    setContent(null);
    setSavedContent(null);
    setContentError(null);
    void loadContent();
  }, [chunk.id, loadContent]);

  useEffect(() => {
    if (!focusSection) return;
    const target =
      focusSection === 'table'
        ? tableSectionRef.current
        : focusSection === 'facts'
          ? factsSectionRef.current
          : termsSectionRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSection, chunk.id]);

  const tableHighlight = useMemo(
    () =>
      activeEvidenceFactId
        ? computeEvidenceHighlight(activeEvidence, content, chunk.id)
        : null,
    [activeEvidence, activeEvidenceFactId, content, chunk.id],
  );
  const activeTableHighlight = hasTableHighlight(tableHighlight) ? tableHighlight : null;

  const handleToggleEvidence = (factId: string, evidence: FactCardDraft['evidence']) => {
    if (activeEvidenceFactId === factId) {
      setActiveEvidenceFactId(null);
      setActiveEvidence(undefined);
      return;
    }
    setActiveEvidenceFactId(factId);
    setActiveEvidence(evidence);
    tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSave = async () => {
    if (!content || isCommitted) return;
    setIsSaving(true);
    try {
      await putChunkContent(chunk.id, {
        content,
        expected_version: chunk.version,
      });
      toast.success('Table saved');
      await onUpdated();
      await loadContent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommit = async () => {
    if (isDirty) {
      toast.error('Save your edits before committing.');
      return;
    }
    setIsCommitting(true);
    try {
      const result = await commitChunkWithDevMode(chunk.id);
      if (result.fact_session_id) {
        toast.success('Table committed — fact extraction started');
      } else {
        toast.success('Table committed (agents skipped — design/mock mode)');
      }
      await onUpdated();
      factsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleUncommit = async () => {
    setIsUncommitting(true);
    try {
      await uncommitIngestionChunk(chunk.id);
      toast.success('Chunk reopened for editing');
      await onUpdated();
      setActiveEvidenceFactId(null);
      setActiveEvidence(undefined);
      await loadContent();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Uncommit failed';
      if (message.includes('force=true') || message.includes('persisted fact')) {
        const confirmed = window.confirm(
          'This chunk has persisted facts. Uncommitting will delete its facts and NER lineage. Continue?',
        );
        if (confirmed) {
          try {
            await uncommitIngestionChunk(chunk.id, true);
            toast.success('Chunk reopened (downstream facts removed)');
            await onUpdated();
            setActiveEvidenceFactId(null);
            setActiveEvidence(undefined);
            await loadContent();
          } catch (forceErr) {
            toast.error(forceErr instanceof Error ? forceErr.message : 'Force uncommit failed');
          }
        }
      } else {
        toast.error(message);
      }
    } finally {
      setIsUncommitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Review the source table, then work through facts and terms without losing table context.
        </p>
      </header>

      <section ref={tableSectionRef} id="chunk-flow-table" className="space-y-3">
        <FlowStepHeader
          step={1}
          title="Source table"
          description={
            isCommitted
              ? 'Committed table — use See evidence on facts to highlight source rows.'
              : 'Edit headings, rows, and columns, save, then commit to start fact extraction.'
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          {!isCommitted ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isDirty || isSaving}
                onClick={() => void handleSave()}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save table
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isCommitting || isDirty}
                onClick={() => void handleCommit()}
              >
                {isCommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Commit table
              </Button>
              {isDirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            </>
          ) : (
            <>
              <span className="text-sm text-slate-500">Table frozen after commit.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isUncommitting}
                onClick={() => void handleUncommit()}
              >
                {isUncommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Uncommit
              </Button>
            </>
          )}
          {activeEvidenceFactId && activeTableHighlight && (
            <span className="text-xs font-medium text-amber-800">
              Highlighting evidence in table
            </span>
          )}
        </div>

        {isLoadingContent && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading table…
          </div>
        )}

        {contentError && (
          <div className="space-y-2">
            <p className="text-sm text-red-700">{contentError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadContent()}>
              Retry
            </Button>
          </div>
        )}

        {content && !isLoadingContent && (
          <EditableTableGrid
            content={content}
            editable={!isCommitted}
            onChange={setContent}
            highlight={activeTableHighlight}
          />
        )}
      </section>

      <section ref={factsSectionRef} id="chunk-flow-facts" className="space-y-3">
        <FlowStepHeader
          step={2}
          title="Facts"
          description="Approve extracted claims and link each one back to the table above."
        />
        {!isCommitted ? (
          <p className="text-sm text-slate-500">Commit the table first to extract and review facts.</p>
        ) : (
          <FactReviewPanel
            chunkId={chunk.id}
            documentId={documentId}
            session={chunkPipeline.fact_session}
            onUpdated={onUpdated}
            activeEvidenceFactId={activeEvidenceFactId}
            onToggleEvidence={handleToggleEvidence}
          />
        )}
      </section>

      {termsAvailable && (
        <section ref={termsSectionRef} id="chunk-flow-terms" className="space-y-3">
          <FlowStepHeader
            step={3}
            title="Terms & metrics"
            description="Map extracted entities to your vocabulary."
          />
          <NerReviewPanel
            chunkId={chunk.id}
            documentId={documentId}
            session={chunkPipeline.ner_session}
            factCount={factCount}
            onUpdated={onUpdated}
          />
        </section>
      )}
    </div>
  );
}

function FlowStepHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
        {step}
      </span>
      <div>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
