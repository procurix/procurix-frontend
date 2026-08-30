import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/shared/components/ui/button';
import type { IngestionDocumentPipeline } from '@/app/services/api/ingestion';
import { commitDocumentChunksWithDevMode } from '@/app/services/api/ingestionClient';
import type { ChunkFlowTab } from '@/app/pages/ingestion/documentWorkspaceUtils';
import { ChunkFlowPanel } from './ChunkFlowPanel';
import { ChunkListItem } from './ChunkListItem';

interface DocumentPipelineViewProps {
  pipeline: IngestionDocumentPipeline;
  focusChunkId?: string | null;
  focusTab?: ChunkFlowTab;
  onRefresh: () => Promise<void>;
}

export function DocumentPipelineView({
  pipeline,
  focusChunkId,
  focusTab,
  onRefresh,
}: DocumentPipelineViewProps) {
  const defaultChunkId = focusChunkId ?? pipeline.chunks[0]?.chunk.id ?? null;
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(defaultChunkId);
  const [isCommittingAll, setIsCommittingAll] = useState(false);

  useEffect(() => {
    if (focusChunkId) {
      setSelectedChunkId(focusChunkId);
    }
  }, [focusChunkId]);

  useEffect(() => {
    if (!selectedChunkId && pipeline.chunks[0]) {
      setSelectedChunkId(pipeline.chunks[0].chunk.id);
    }
  }, [pipeline.chunks, selectedChunkId]);

  const selectedChunkPipeline = useMemo(
    () => pipeline.chunks.find((entry) => entry.chunk.id === selectedChunkId) ?? null,
    [pipeline.chunks, selectedChunkId],
  );

  const uncommittedCount = useMemo(
    () => pipeline.chunks.filter((entry) => entry.chunk.status !== 'committed').length,
    [pipeline.chunks],
  );

  const handleCommitAll = async () => {
    setIsCommittingAll(true);
    try {
      const results = await commitDocumentChunksWithDevMode(pipeline.document.id);
      toast.success(
        results.length
          ? `Committed ${results.length} chunk${results.length === 1 ? '' : 's'}`
          : 'All chunks were already committed',
      );
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit all failed');
    } finally {
      setIsCommittingAll(false);
    }
  };

  if (!pipeline.chunks.length) {
    const parsingJobs = pipeline.jobs.filter(
      (job) => job.kind === 'parse' && (job.status === 'queued' || job.status === 'running'),
    );
    return (
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
        {parsingJobs.length ? (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
            <p className="mt-3 text-sm font-medium text-slate-700">Parsing spreadsheet…</p>
            <p className="mt-1 text-sm text-slate-500">Table chunks will appear here when ready.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">No table chunks yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Re-upload with parsing enabled, or check parse job errors on the documents list.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Chunk workspace</h3>
          <p className="text-sm text-slate-500">
            Select a table on the left, then walk through commit, facts, and terms on the right.
          </p>
        </div>
        {uncommittedCount > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={isCommittingAll}
            onClick={() => void handleCommitAll()}
          >
            {isCommittingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Commit all ({uncommittedCount})
          </Button>
        )}
      </div>

      <div className="flex min-h-[36rem] overflow-hidden rounded-lg border border-slate-200 bg-white">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
          <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tables ({pipeline.chunks.length})
          </p>
          {pipeline.chunks.map((chunkPipeline) => (
            <ChunkListItem
              key={chunkPipeline.chunk.id}
              chunkPipeline={chunkPipeline}
              selected={selectedChunkId === chunkPipeline.chunk.id}
              onSelect={() => setSelectedChunkId(chunkPipeline.chunk.id)}
            />
          ))}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {selectedChunkPipeline ? (
            <ChunkFlowPanel
              key={selectedChunkPipeline.chunk.id}
              chunkPipeline={selectedChunkPipeline}
              documentId={pipeline.document.id}
              focusSection={selectedChunkId === focusChunkId ? focusTab : undefined}
              onUpdated={onRefresh}
            />
          ) : (
            <p className="text-sm text-slate-500">Select a table to begin review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
