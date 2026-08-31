import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  CatalogMention,
  IngestionAgentSession,
  NerSessionDetail,
  NerStage,
  NerStageBatch,
} from '@/app/services/api/ingestion';
import {
  advanceNerWithDevMode,
  fetchChunkMentions,
  fetchNerSessionDetail,
  fetchNerSessionMessages,
  initMockNerSession,
  persistNerWithDevMode,
  sendNerChatMessage,
  startLiveNerExtraction,
  submitNerReview,
} from '@/app/services/api/ingestionClient';
import { useIngestionDev } from '@/app/pages/ingestion/state/IngestionDevContext';
import { useIngestionPoll } from '@/app/pages/ingestion/hooks/useIngestionPoll';
import { AgentChatPanel } from './AgentChatPanel';
import { filterHumanChatMessages } from './chatMessageUtils';
import { MentionListPanel } from './MentionListPanel';
import { NerBatchEditor } from './NerBatchEditor';
import { NerStageStepper } from './NerStageStepper';
import {
  isNerItemKept,
  listStageBatchItems,
  normalizeNerBatchForApproval,
  countNerReviewStates,
} from './nerReviewUtils';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';

interface NerReviewPanelProps {
  chunkId: string;
  documentId: string;
  session: IngestionAgentSession | null;
  factCount: number;
  onUpdated: () => Promise<void>;
}

function extractEditableBatch(detail: NerSessionDetail | null): NerStageBatch | null {
  if (!detail) return null;
  if (detail.pending_review?.payload?.batch) {
    return JSON.parse(JSON.stringify(detail.pending_review.payload.batch)) as NerStageBatch;
  }
  if (detail.stage_batch) {
    return JSON.parse(JSON.stringify(detail.stage_batch)) as NerStageBatch;
  }
  return null;
}

export function NerReviewPanel({
  chunkId,
  documentId,
  session,
  factCount,
  onUpdated,
}: NerReviewPanelProps) {
  const dev = useIngestionDev();
  const [effectiveSessionId, setEffectiveSessionId] = useState<string | null>(session?.id ?? null);
  const [detail, setDetail] = useState<NerSessionDetail | null>(null);
  const [batch, setBatch] = useState<NerStageBatch | null>(null);
  const [mentions, setMentions] = useState<CatalogMention[]>([]);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof fetchNerSessionMessages>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  useEffect(() => {
    if (session?.id) setEffectiveSessionId(session.id);
  }, [session?.id]);

  const refresh = useCallback(async () => {
    if (!effectiveSessionId) return;
    setIsLoading(true);
    try {
      const [nextDetail, nextMessages, nextMentions] = await Promise.all([
        fetchNerSessionDetail(effectiveSessionId, chunkId, documentId),
        fetchNerSessionMessages(effectiveSessionId, chunkId, documentId),
        fetchChunkMentions(chunkId, effectiveSessionId, documentId),
      ]);
      setDetail(nextDetail);
      setBatch(extractEditableBatch(nextDetail));
      setMessages(filterHumanChatMessages(nextMessages));
      setMentions(nextMentions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load NER session');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSessionId, chunkId, documentId]);

  useEffect(() => {
    if (effectiveSessionId) void refresh();
  }, [effectiveSessionId, refresh]);

  const stage = (detail?.stage ?? session?.stage ?? 'candidate') as NerStage;
  const status = detail?.session.status ?? session?.status ?? 'none';
  const isDrafting = status === 'drafting' || status === 'created';
  const awaitingReview = status === 'awaiting_review';
  const canPersist = stage === 'mapping' && status === 'reviewed';
  const canAdvance = status === 'reviewed' && stage !== 'mapping';
  const isPersisted = status === 'persisted';

  useIngestionPoll(refresh, {
    enabled: Boolean(effectiveSessionId) && !dev.mockMode,
    whileActive: () => isDrafting,
  });

  const handleInitMock = () => {
    const id = initMockNerSession(chunkId, documentId);
    setEffectiveSessionId(id);
  };

  const handleStartLive = async () => {
    setIsStartingLive(true);
    try {
      const turn = await startLiveNerExtraction(chunkId);
      setEffectiveSessionId(turn.session.id);
      toast.success('NER extraction started');
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start NER');
    } finally {
      setIsStartingLive(false);
    }
  };

  const handleReview = async (confirmed: boolean) => {
    if (!effectiveSessionId || !batch) return;
    if (confirmed) {
      const normalized = normalizeNerBatchForApproval(batch, stage);
      const kept = listStageBatchItems(normalized, stage).filter(isNerItemKept).length;
      if (kept === 0) {
        toast.error('Approve at least one item, or reject the whole batch.');
        return;
      }
      setIsReviewing(true);
      try {
        await submitNerReview(effectiveSessionId, chunkId, documentId, {
          confirmed: true,
          batch: normalized,
        });
        const rejected = listStageBatchItems(normalized, stage).length - kept;
        toast.success(
          rejected > 0
            ? `Approved ${kept} item${kept === 1 ? '' : 's'} (${rejected} rejected)`
            : `Approved ${stage} batch`,
        );
        await refresh();
        await onUpdated();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Review failed');
      } finally {
        setIsReviewing(false);
      }
      return;
    }

    setIsReviewing(true);
    try {
      await submitNerReview(effectiveSessionId, chunkId, documentId, { confirmed: false });
      toast.success(`${stage} batch rejected`);
      await refresh();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleAdvance = async () => {
    if (!effectiveSessionId) return;
    setIsAdvancing(true);
    try {
      await advanceNerWithDevMode(effectiveSessionId, chunkId, documentId);
      toast.success('Advancing to next stage…');
      await refresh();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Advance failed');
    } finally {
      setIsAdvancing(false);
    }
  };

  const handlePersist = async () => {
    if (!effectiveSessionId) return;
    setIsPersisting(true);
    try {
      const result = await persistNerWithDevMode(effectiveSessionId, chunkId, documentId);
      toast.success(`Persisted ${result.mention_links.length} mention link(s)`);
      await refresh();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Persist failed');
    } finally {
      setIsPersisting(false);
    }
  };

  const handleChat = async (message: string) => {
    if (!effectiveSessionId) return;
    setIsChatting(true);
    try {
      await sendNerChatMessage(effectiveSessionId, chunkId, documentId, message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setIsChatting(false);
    }
  };

  const headerBadge = useMemo(() => status, [status]);
  const reviewCounts = useMemo(
    () => (batch ? countNerReviewStates(listStageBatchItems(batch, stage)) : null),
    [batch, stage],
  );
  const canConfirmBatch = reviewCounts ? reviewCounts.approved + reviewCounts.pending > 0 : false;
  const needsFacts = factCount === 0 && !dev.mockMode;

  if (needsFacts) {
    return (
      <p className="text-sm text-slate-500">
        Commit and persist fact cards first — NER runs over reviewed facts.
      </p>
    );
  }

  if (!effectiveSessionId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">No NER session yet</p>
        <p className="mt-1 text-sm text-slate-500">
          {dev.mockMode
            ? 'Load mock NER to design the terms review UI without calling Gemini.'
            : dev.designMode
              ? 'Facts committed without NER — start mock NER or run live when ready.'
              : 'Commit facts to auto-start NER, or start manually below.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(dev.mockMode || dev.designMode) && (
            <Button type="button" size="sm" onClick={handleInitMock}>
              Use mock NER session
            </Button>
          )}
          {!dev.mockMode && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isStartingLive || dev.designMode}
              onClick={() => void handleStartLive()}
            >
              {isStartingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Start NER (live)
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NerStageStepper currentStage={stage} sessionStatus={status} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{stage}</Badge>
        <Badge variant="outline">{headerBadge}</Badge>
        {dev.mockMode && <Badge variant="secondary">mock</Badge>}
        {isDrafting && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            {stage} agent drafting…
          </span>
        )}
      </div>

      {isLoading && !detail && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading NER session…
        </div>
      )}

      {awaitingReview && batch && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Review each term or metric — approve or reject individually, edit fields as needed,
            then confirm the batch. Rejected items are excluded when you advance or persist.
          </p>
          {reviewCounts && (
            <p className="text-xs text-slate-500">
              {reviewCounts.approved + reviewCounts.pending} to keep
              {reviewCounts.rejected > 0 ? ` · ${reviewCounts.rejected} rejected` : ''}
            </p>
          )}
          <NerBatchEditor
            stage={stage}
            batch={batch}
            editable
            reviewable
            onChange={setBatch}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isReviewing || !canConfirmBatch}
              onClick={() => void handleReview(true)}
            >
              {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm batch
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isReviewing}
              onClick={() => void handleReview(false)}
            >
              Reject entire batch
            </Button>
          </div>
        </div>
      )}

      {!awaitingReview && batch && !canPersist && !isPersisted && (
        <NerBatchEditor stage={stage} batch={batch} editable={false} onChange={() => {}} />
      )}

      {canAdvance && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            {stage} stage approved — advance to the next stage when ready.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={isAdvancing}
            onClick={() => void handleAdvance()}
          >
            {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Advance to next stage
          </Button>
        </div>
      )}

      {canPersist && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-900">
            Mapping approved — ready to persist buckets and mention lineage.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={isPersisting}
            onClick={() => void handlePersist()}
          >
            {isPersisting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Persist buckets + lineage
            {dev.mockMode ? ' (mock)' : ''}
          </Button>
        </div>
      )}

      {detail?.persistence_result && (
        <p className="text-xs text-slate-500">
          Persistence: {JSON.stringify(detail.persistence_result.counts ?? detail.persistence_result)}
        </p>
      )}

      <MentionListPanel mentions={mentions} />

      {canUseNerAgentChat(status, isPersisted) && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-slate-900">Revise with agent</h4>
          <p className="mb-2 text-xs text-slate-500">
            {status === 'rejected'
              ? 'Ask the agent to rework this stage before starting a new review.'
              : 'Request mapping or cluster changes before persisting — the agent will re-open review.'}
          </p>
          <AgentChatPanel
            messages={messages}
            placeholder="e.g. split the supplier cluster, remap OTIF to an existing bucket…"
            isSending={isChatting}
            onSend={handleChat}
          />
        </div>
      )}
    </div>
  );
}

function canUseNerAgentChat(status: string, isPersisted: boolean): boolean {
  if (isPersisted) return false;
  return status === 'reviewed' || status === 'rejected';
}
