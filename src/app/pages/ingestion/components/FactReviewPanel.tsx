import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  FactBatch,
  FactCardDraft,
  FactSessionDetail,
  IngestionAgentSession,
} from '@/app/services/api/ingestion';
import {
  commitFactsWithDevMode,
  fetchChunkFactCards,
  fetchFactSessionDetail,
  fetchFactSessionMessages,
  initMockFactSession,
  sendFactChatMessage,
  startLiveFactExtraction,
  submitFactReview,
} from '@/app/services/api/ingestionClient';
import { useIngestionDev } from '@/app/pages/ingestion/state/IngestionDevContext';
import { useIngestionPoll } from '@/app/pages/ingestion/hooks/useIngestionPoll';
import { AgentChatPanel } from './AgentChatPanel';
import { filterHumanChatMessages } from './chatMessageUtils';
import { FactCardEditor } from './FactCardEditor';
import {
  countFactReviewStates,
  isFactApprovedForCommit,
  normalizeFactBatchForApproval,
} from './factReviewUtils';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';

interface FactReviewPanelProps {
  chunkId: string;
  documentId: string;
  session: IngestionAgentSession | null;
  onUpdated: () => Promise<void>;
  activeEvidenceFactId?: string | null;
  onToggleEvidence?: (factId: string, evidence: FactCardDraft['evidence']) => void;
}

function extractEditableBatch(detail: FactSessionDetail | null): FactBatch | null {
  if (!detail) return null;
  if (detail.pending_review?.payload?.batch) {
    return JSON.parse(JSON.stringify(detail.pending_review.payload.batch)) as FactBatch;
  }
  if (detail.current_batch) return JSON.parse(JSON.stringify(detail.current_batch)) as FactBatch;
  return null;
}

export function FactReviewPanel({
  chunkId,
  documentId,
  session,
  onUpdated,
  activeEvidenceFactId,
  onToggleEvidence,
}: FactReviewPanelProps) {
  const dev = useIngestionDev();
  const [effectiveSessionId, setEffectiveSessionId] = useState<string | null>(session?.id ?? null);
  const [detail, setDetail] = useState<FactSessionDetail | null>(null);
  const [batch, setBatch] = useState<FactBatch | null>(null);
  const [persistedFacts, setPersistedFacts] = useState<Awaited<ReturnType<typeof fetchChunkFactCards>>>([]);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof fetchFactSessionMessages>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);

  useEffect(() => {
    if (session?.id) setEffectiveSessionId(session.id);
  }, [session?.id]);

  const refresh = useCallback(async () => {
    if (!effectiveSessionId) return;
    setIsLoading(true);
    try {
      const [nextDetail, nextMessages, nextFacts] = await Promise.all([
        fetchFactSessionDetail(effectiveSessionId, chunkId, documentId),
        fetchFactSessionMessages(effectiveSessionId, chunkId, documentId),
        fetchChunkFactCards(chunkId, effectiveSessionId, documentId),
      ]);
      setDetail(nextDetail);
      setBatch(extractEditableBatch(nextDetail));
      setMessages(filterHumanChatMessages(nextMessages));
      setPersistedFacts(nextFacts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load fact session');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSessionId, chunkId, documentId]);

  useEffect(() => {
    if (effectiveSessionId) void refresh();
  }, [effectiveSessionId, refresh]);

  const isDrafting = detail?.session.status === 'drafting' || detail?.session.status === 'created';
  const awaitingReview = detail?.session.status === 'awaiting_review';
  const canCommitFacts = detail?.session.status === 'reviewed';
  const isCommitted = detail?.session.status === 'committed';
  const showPersistedFacts = persistedFacts.length > 0;
  const showSessionBatch =
    Boolean(batch) && !isCommitted && !showPersistedFacts && (awaitingReview || !canCommitFacts);

  useIngestionPoll(refresh, {
    enabled: Boolean(effectiveSessionId) && !dev.mockMode,
    whileActive: () => isDrafting,
  });

  const handleInitMock = () => {
    const id = initMockFactSession(chunkId, documentId);
    setEffectiveSessionId(id);
  };

  const handleStartLive = async () => {
    setIsStartingLive(true);
    try {
      const turn = await startLiveFactExtraction(chunkId);
      setEffectiveSessionId(turn.session.id);
      toast.success('Fact extraction started');
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start fact extraction');
    } finally {
      setIsStartingLive(false);
    }
  };

  const handleReview = async (confirmed: boolean) => {
    if (!effectiveSessionId || !batch) return;
    if (confirmed) {
      const normalized = normalizeFactBatchForApproval(batch);
      const kept = normalized.facts.filter(isFactApprovedForCommit).length;
      if (kept === 0) {
        toast.error('Approve at least one fact, or reject the whole batch.');
        return;
      }
      setIsReviewing(true);
      try {
        await submitFactReview(effectiveSessionId, chunkId, documentId, {
          confirmed: true,
          batch: normalized,
        });
        const rejected = normalized.facts.length - kept;
        toast.success(
          rejected > 0
            ? `Approved ${kept} fact${kept === 1 ? '' : 's'} (${rejected} rejected)`
            : `Approved ${kept} fact${kept === 1 ? '' : 's'}`,
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
      await submitFactReview(effectiveSessionId, chunkId, documentId, { confirmed: false });
      toast.success('Fact batch rejected');
      await refresh();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleCommitFacts = async () => {
    if (!effectiveSessionId) return;
    setIsCommitting(true);
    try {
      const result = await commitFactsWithDevMode(effectiveSessionId, chunkId, documentId);
      toast.success(`Persisted ${result.facts.length} fact card(s)`);
      await refresh();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit facts failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleChat = async (message: string) => {
    if (!effectiveSessionId) return;
    setIsChatting(true);
    try {
      await sendFactChatMessage(effectiveSessionId, chunkId, documentId, message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setIsChatting(false);
    }
  };

  const updateFact = (index: number, next: FactCardDraft) => {
    if (!batch) return;
    const facts = [...batch.facts];
    facts[index] = next;
    setBatch({ ...batch, facts });
  };

  const setFactReviewStatus = (index: number, review_status: FactCardDraft['review_status']) => {
    if (!batch) return;
    const facts = [...batch.facts];
    facts[index] = { ...facts[index], review_status };
    setBatch({ ...batch, facts });
  };

  const reviewCounts = useMemo(
    () => (batch ? countFactReviewStates(batch.facts) : null),
    [batch],
  );

  const canConfirmBatch = reviewCounts ? reviewCounts.approved + reviewCounts.pending > 0 : false;

  const evidenceProps = (fact: FactCardDraft) => ({
    evidenceActive: activeEvidenceFactId === fact.fact_id,
    onToggleEvidence: onToggleEvidence
      ? () => onToggleEvidence(fact.fact_id, fact.evidence)
      : undefined,
  });

  const headerBadge = useMemo(() => {
    const status = detail?.session.status ?? session?.status ?? 'none';
    return status;
  }, [detail?.session.status, session?.status]);

  if (!effectiveSessionId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">No fact session yet</p>
        <p className="mt-1 text-sm text-slate-500">
          {dev.mockMode
            ? 'Load mock facts to design the review UI without calling Gemini.'
            : dev.designMode
              ? 'Commit skipped agents — start mock facts or run live extraction when ready.'
              : 'Commit the table to auto-start extraction, or start manually below.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(dev.mockMode || dev.designMode) && (
            <Button type="button" size="sm" onClick={handleInitMock}>
              Use mock fact session
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
              Extract facts (live)
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{headerBadge}</Badge>
        {dev.mockMode && <Badge variant="secondary">mock</Badge>}
        {isDrafting && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            Agent drafting…
          </span>
        )}
      </div>

      {isLoading && !detail && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading fact session…
        </div>
      )}

      {awaitingReview && showSessionBatch && batch && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Review each fact — approve or reject individually, edit fields as needed, then
            confirm the batch. Rejected facts are excluded when you commit.
          </p>
          {reviewCounts && (
            <p className="text-xs text-slate-500">
              {reviewCounts.approved + reviewCounts.pending} to keep
              {reviewCounts.rejected > 0 ? ` · ${reviewCounts.rejected} rejected` : ''}
            </p>
          )}
          {batch.facts.map((fact, index) => (
            <FactCardEditor
              key={fact.fact_id}
              fact={fact}
              index={index}
              editable
              reviewable
              onChange={(next) => updateFact(index, next)}
              onApprove={() => setFactReviewStatus(index, 'approved')}
              onReject={() => setFactReviewStatus(index, 'rejected')}
              {...evidenceProps(fact)}
            />
          ))}
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

      {!awaitingReview && showSessionBatch && batch && (
        <div className="space-y-3">
          {batch.facts.map((fact, index) => (
            <FactCardEditor
              key={fact.fact_id}
              fact={fact}
              index={index}
              editable={false}
              onChange={() => {}}
              {...evidenceProps(fact)}
            />
          ))}
        </div>
      )}

      {canCommitFacts && batch && !showPersistedFacts && (
        <div className="space-y-3">
          {batch.facts.filter(isFactApprovedForCommit).map((fact, index) => (
            <FactCardEditor
              key={fact.fact_id}
              fact={fact}
              index={index}
              editable={false}
              onChange={() => {}}
              {...evidenceProps(fact)}
            />
          ))}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-900">
              Batch confirmed — ready to persist{' '}
              {batch.facts.filter(isFactApprovedForCommit).length} fact card(s).
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              disabled={isCommitting}
              onClick={() => void handleCommitFacts()}
            >
              {isCommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Commit facts
              {dev.designMode || dev.mockMode ? ' (no NER)' : ''}
            </Button>
          </div>
        </div>
      )}

      {showPersistedFacts && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">
            Persisted facts ({persistedFacts.length})
          </h4>
          {persistedFacts.map((fact, index) => {
            const draft: FactCardDraft = {
              fact_id: fact.id,
              fact_kind: fact.fact_kind,
              claim: fact.claim,
              sme_lens: fact.sme_lens,
              design_relevance: fact.design_relevance,
              design_action: fact.design_action,
              reasoning: fact.reasoning,
              confidence: fact.confidence,
              review_status: fact.review_status,
              evidence: fact.evidence,
            };
            return (
              <FactCardEditor
                key={fact.id}
                fact={draft}
                index={index}
                editable={false}
                onChange={() => {}}
                {...evidenceProps(draft)}
              />
            );
          })}
        </div>
      )}

      {canUseFactAgentChat(detail?.session.status) && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-slate-900">Revise with agent</h4>
          <p className="mb-2 text-xs text-slate-500">
            {detail?.session.status === 'rejected'
              ? 'Ask the agent to draft a new batch, or adjust extraction focus before re-reviewing.'
              : 'Request new facts or batch-level changes before persisting — the agent will re-open review.'}
          </p>
          <AgentChatPanel
            messages={messages}
            placeholder={
              detail?.session.status === 'rejected'
                ? 'e.g. focus on supplier risk facts, ignore row-level duplicates…'
                : 'e.g. add a fact about lead time, merge facts 1 and 2…'
            }
            isSending={isChatting}
            onSend={handleChat}
          />
        </div>
      )}
    </div>
  );
}

function canUseFactAgentChat(status: string | undefined): boolean {
  return status === 'reviewed' || status === 'rejected';
}
