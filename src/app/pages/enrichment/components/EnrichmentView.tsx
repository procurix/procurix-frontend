import { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import {
  CheckCircle, Loader2, Database, AlertCircle,
  ArrowRight, Cpu, AlertTriangle, Link, RefreshCw, XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';
import {
  triggerModelEnrichment,
  getModelEnrichmentStatus,
  updatePartDatasheetUrl,
  reIdentifyPart,
  type ModelEnrichmentStatus,
  type PartEnrichmentDetail,
  type PartEnrichmentState,
} from '@/app/services/api';
import { PartModelDrawer } from '@/app/shared/components/PartModelDrawer';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function needsAutomaticEnrichmentAttempt(status: ModelEnrichmentStatus): boolean {
  return status.parts.some(part => {
    if (part.status === 'extracting') return true;
    if (part.status !== 'no_datasheet') return false;
    return part.datasheet_source !== 'not_found';
  });
}

// ── Per-part card ─────────────────────────────────────────────────────────────

interface PartCardProps {
  part: PartEnrichmentDetail;
  elapsedMs: number | undefined;
  isEditing: boolean;
  urlInput: string;
  isSubmitting: boolean;
  isReIdentifying: boolean;
  confirmingOverwrite: boolean;
  onViewModel: () => void;
  onToggleEdit: () => void;
  onUrlChange: (v: string) => void;
  onSubmitUrl: () => void;
  onReIdentify: () => void;
  onConfirmOverwrite: () => void;
  onCancelOverwrite: () => void;
}

function PartCard({
  part, elapsedMs, isEditing, urlInput, isSubmitting,
  isReIdentifying, confirmingOverwrite,
  onViewModel, onToggleEdit, onUrlChange, onSubmitUrl,
  onReIdentify, onConfirmOverwrite, onCancelOverwrite,
}: PartCardProps) {
  const isStuck = part.status === 'extracting' && (elapsedMs ?? 0) > STUCK_THRESHOLD_MS;

  const borderClass: Record<PartEnrichmentState, string> = {
    done: 'border-green-200 bg-green-50',
    extracting: isStuck ? 'border-orange-200 bg-orange-50' : 'border-blue-100 bg-white',
    no_datasheet: 'border-amber-200 bg-amber-50',
    failed: 'border-red-200 bg-red-50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border px-4 py-3 transition-colors ${borderClass[part.status]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {part.status === 'done' && (
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
          )}
          {part.status === 'extracting' && (
            <Loader2 className={`h-5 w-5 animate-spin shrink-0 ${isStuck ? 'text-orange-400' : 'text-blue-400'}`} />
          )}
          {part.status === 'no_datasheet' && (
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          )}
          {part.status === 'failed' && (
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          )}

          <div className="flex flex-col min-w-0">
            <span className="font-mono text-sm font-medium text-gray-800">{part.mpn}</span>

            {part.status === 'extracting' && elapsedMs !== undefined && (
              <span className={`text-xs mt-0.5 ${isStuck ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                {isStuck
                  ? `Stuck — ${formatElapsed(elapsedMs)} elapsed — worker may be down`
                  : `Running for ${formatElapsed(elapsedMs)}`}
              </span>
            )}

            {part.status === 'no_datasheet' && (
              <span className="text-xs text-amber-600 mt-0.5">No datasheet — add a PDF URL to extract</span>
            )}

            {part.status === 'failed' && part.failure_reason && (
              <span
                className="text-xs text-red-600 mt-0.5 break-all"
                title={part.failure_reason}
              >
                {part.failure_reason.length > 120
                  ? `${part.failure_reason.slice(0, 120)}…`
                  : part.failure_reason}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {part.status === 'done' && (
            <button
              onClick={onViewModel}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
            >
              <Cpu className="h-3 w-3" />
              View Model
            </button>
          )}
          {part.status === 'no_datasheet' && (
            <button
              onClick={onToggleEdit}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2 py-1 hover:bg-amber-50 transition-colors"
            >
              <Link className="h-3 w-3" />
              {isEditing ? 'Cancel' : 'Add URL'}
            </button>
          )}
          {part.status === 'failed' && (
            <button
              onClick={onToggleEdit}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-2 py-1 hover:bg-red-100 transition-colors"
            >
              <Link className="h-3 w-3" />
              {isEditing ? 'Cancel' : 'Retry with URL'}
            </button>
          )}
          {part.source && (
            <button
              onClick={onReIdentify}
              disabled={isReIdentifying}
              title={isStuck ? 'Stuck — force re-fetch from Nexar' : 'Re-fetch from Nexar and re-extract model'}
              className={`flex items-center gap-1 text-xs border rounded px-2 py-1 disabled:opacity-40 transition-colors ${
                isStuck
                  ? 'text-orange-600 hover:text-orange-800 border-orange-300 hover:bg-orange-50'
                  : 'text-gray-500 hover:text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <RefreshCw className={`h-3 w-3 ${isReIdentifying ? 'animate-spin' : ''}`} />
              {isStuck ? 'Force re-identify' : 'Re-identify'}
            </button>
          )}
        </div>
      </div>

      {/* Inline URL input for no_datasheet or failed */}
      {(part.status === 'no_datasheet' || part.status === 'failed') && isEditing && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="url"
            placeholder="https://example.com/datasheet.pdf"
            value={urlInput}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && onSubmitUrl()}
            className="flex-1 text-xs border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
            autoFocus
          />
          <button
            onClick={onSubmitUrl}
            disabled={isSubmitting || !urlInput.trim()}
            className="flex items-center gap-1 text-xs bg-amber-500 text-white rounded px-3 py-1.5 hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry'}
          </button>
        </div>
      )}

      {/* Inline overwrite confirmation */}
      {confirmingOverwrite && (
        <div className="mt-3 flex items-start gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-orange-700">
              This part already has an extracted model. Re-identifying will overwrite it.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={onConfirmOverwrite}
                className="text-xs bg-orange-500 text-white rounded px-3 py-1 hover:bg-orange-600 transition-colors"
              >
                Yes, overwrite
              </button>
              <button
                onClick={onCancelOverwrite}
                className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function EnrichmentView() {
  const { sessionId } = useSession();
  const { navigateToStage, unlockStage } = useWorkflowNavigation();
  const [status, setStatus] = useState<ModelEnrichmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelDrawerMpn, setModelDrawerMpn] = useState<string | null>(null);
  const [editingMpns, setEditingMpns] = useState<Set<string>>(new Set());
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [submittingMpns, setSubmittingMpns] = useState<Set<string>>(new Set());
  const [reIdentifyingMpns, setReIdentifyingMpns] = useState<Set<string>>(new Set());
  const [confirmingOverwriteMpns, setConfirmingOverwriteMpns] = useState<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // After a user-triggered re-identify or URL submit, keep polling for at least
  // this many more intervals even if the server says complete=true, because the
  // background task may not have written its result to the DB yet.
  const guaranteedPollsRef = useRef(0);

  // Tracks when each MPN was first seen in "extracting" state.
  // Stored in a ref to avoid triggering re-renders on update.
  const firstSeenExtractingAt = useRef<Record<string, number>>({});
  const initStartedRef = useRef(false);

  // Incremented every second while any part is extracting — forces elapsed time to update.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const markEnrichmentComplete = useCallback(() => {
    unlockStage('validate');
  }, [unlockStage]);

  // Keep firstSeenExtractingAt in sync with each status update.
  useEffect(() => {
    if (!status) return;
    const now = Date.now();
    for (const p of status.parts) {
      if (p.status === 'extracting') {
        if (!(p.mpn in firstSeenExtractingAt.current)) {
          firstSeenExtractingAt.current[p.mpn] = now;
        }
      } else {
        delete firstSeenExtractingAt.current[p.mpn];
      }
    }
  }, [status]);

  // Tick every second while any extraction is in flight so elapsed times update.
  useEffect(() => {
    if (!status?.extracting) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status?.extracting, tick]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const s = await getModelEnrichmentStatus(sessionId);
        if (cancelled) return;
        setStatus(s);
        if (s.complete) {
          markEnrichmentComplete();
          if (guaranteedPollsRef.current > 0) {
            guaranteedPollsRef.current -= 1;
          } else {
            stopPolling();
          }
        }
      } catch {
        if (cancelled) return;
        setError('Failed to fetch enrichment status.');
        stopPolling();
      }
    };

    const init = async () => {
      try {
        const initial = await getModelEnrichmentStatus(sessionId);
        if (cancelled) return;
        setStatus(initial);
        const needsAttempt = needsAutomaticEnrichmentAttempt(initial);

        if (initial.complete && !needsAttempt) {
          markEnrichmentComplete();
          stopPolling();
          return;
        }

        if (!initStartedRef.current && needsAttempt) {
          initStartedRef.current = true;
          await triggerModelEnrichment(sessionId);
          const started = await getModelEnrichmentStatus(sessionId);
          if (cancelled) return;
          setStatus(started);
        }

        if (!pollingRef.current) {
          pollingRef.current = setInterval(fetchStatus, 4000);
        }
      } catch (error) {
        if (cancelled) return;
        const rawMessage = error instanceof Error ? error.message : 'Failed to start enrichment.';
        const message = rawMessage.includes('409')
          ? 'Enrichment has already completed. Continue to Part Review.'
          : rawMessage;
        toast.error(message);
        setError(message);
      }
    };

    init();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [sessionId, markEnrichmentComplete]);

  const toggleEditing = (mpn: string) => {
    setEditingMpns(prev => {
      const next = new Set(prev);
      if (next.has(mpn)) next.delete(mpn);
      else next.add(mpn);
      return next;
    });
  };

  const ensurePolling = () => {
    if (!sessionId) return;
    // Guarantee at least 30 more polls (~2 min) so background tasks have time
    // to write their result even if the server transiently says complete=true.
    guaranteedPollsRef.current = Math.max(guaranteedPollsRef.current, 30);
    if (pollingRef.current) return;
    const fetchStatus = async () => {
      try {
        const s = await getModelEnrichmentStatus(sessionId);
        setStatus(s);
        if (s.complete) {
          if (guaranteedPollsRef.current > 0) {
            guaranteedPollsRef.current -= 1;
          } else {
            stopPolling();
          }
        }
      } catch {
        stopPolling();
      }
    };
    pollingRef.current = setInterval(fetchStatus, 4000);
  };

  const triggerReIdentify = async (mpn: string) => {
    if (!sessionId) return;
    setConfirmingOverwriteMpns(prev => { const n = new Set(prev); n.delete(mpn); return n; });
    setReIdentifyingMpns(prev => new Set(prev).add(mpn));
    try {
      await reIdentifyPart(sessionId, mpn);
      setStatus(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          complete: false,
          parts: prev.parts.map(p =>
            p.mpn === mpn ? { ...p, status: 'extracting' as PartEnrichmentState } : p
          ),
        };
      });
      ensurePolling();
    } catch {
      toast.error(`Failed to re-identify ${mpn}.`);
    } finally {
      setReIdentifyingMpns(prev => { const n = new Set(prev); n.delete(mpn); return n; });
    }
  };

  const handleReIdentify = (mpn: string, hasModel: boolean) => {
    if (hasModel) {
      setConfirmingOverwriteMpns(prev => new Set(prev).add(mpn));
    } else {
      void triggerReIdentify(mpn);
    }
  };

  const handleSubmitUrl = async (mpn: string) => {
    const url = (urlInputs[mpn] ?? '').trim();
    if (!url || !sessionId) return;

    setSubmittingMpns(prev => new Set(prev).add(mpn));
    try {
      await updatePartDatasheetUrl(sessionId, mpn, url);
      setStatus(prev => {
        if (!prev) return prev;
        const prevPart = prev.parts.find(p => p.mpn === mpn);
        const wasFailed = prevPart?.status === 'failed';
        return {
          ...prev,
          extracting: prev.extracting + 1,
          no_datasheet: wasFailed ? prev.no_datasheet : Math.max(0, prev.no_datasheet - 1),
          failed: wasFailed ? Math.max(0, (prev.failed ?? 0) - 1) : prev.failed ?? 0,
          complete: false,
          parts: prev.parts.map(p =>
            p.mpn === mpn
              ? {
                  ...p,
                  status: 'extracting' as PartEnrichmentState,
                  datasheet_url: url,
                  datasheet_source: 'user',
                  failure_reason: null,
                }
              : p
          ),
        };
      });
      setEditingMpns(prev => { const n = new Set(prev); n.delete(mpn); return n; });
      setUrlInputs(prev => { const n = { ...prev }; delete n[mpn]; return n; });
      ensurePolling();
    } catch {
      toast.error(`Failed to update datasheet URL for ${mpn}.`);
    } finally {
      setSubmittingMpns(prev => { const n = new Set(prev); n.delete(mpn); return n; });
    }
  };

  const handleContinue = () => {
    navigateToStage('validate');
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No active session.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Progress excludes failed parts (they're terminal, not in-flight).
  const enrichable = status.done + status.extracting;
  const progressPct = enrichable > 0
    ? Math.round((status.done / enrichable) * 100)
    : 100;

  const failedCount = status.failed ?? 0;

  const stuckCount = status.parts.filter(p => {
    const t = firstSeenExtractingAt.current[p.mpn];
    return p.status === 'extracting' && t !== undefined && Date.now() - t > STUCK_THRESHOLD_MS;
  }).length;

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="h-7 w-7 text-blue-500" />
          <h1 className="text-2xl font-bold text-gray-900">Part Model Enrichment</h1>
        </div>
        <p className="text-sm text-gray-500">
          Extracting electrical models from datasheets using Docling + Claude.
          {status.total === 0 && ' No non-auxiliary parts found.'}
        </p>
      </div>

      {/* Progress bar */}
      {enrichable > 0 && (
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{status.done} of {enrichable} enriched</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          {!status.complete && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting — Docling + Claude, a few minutes per part
            </p>
          )}
        </div>
      )}

      {/* Stuck warning banner */}
      {stuckCount > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {stuckCount} part{stuckCount > 1 ? 's have' : ' has'} been extracting for over 10 minutes.
            The Temporal worker may be down or overloaded — check worker logs.
          </span>
        </div>
      )}

      {/* Failed extraction banner */}
      {failedCount > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {failedCount} part{failedCount > 1 ? 's' : ''} failed extraction — see reasons below.
            You can supply a different PDF URL to retry, or continue without these parts.
          </span>
        </div>
      )}

      {/* No-datasheet hint */}
      {status.no_datasheet > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {status.no_datasheet} part{status.no_datasheet > 1 ? 's' : ''} have no datasheet URL.
            Add a direct PDF link below to enrich them, or continue without.
          </span>
        </div>
      )}

      {/* Per-part cards */}
      {status.parts.length > 0 && (
        <div className="space-y-2 mb-10">
          {status.parts.map((part) => {
            const startedAt = firstSeenExtractingAt.current[part.mpn];
            const elapsedMs = startedAt !== undefined ? Date.now() - startedAt : undefined;
            return (
              <PartCard
                key={part.mpn}
                part={part}
                elapsedMs={elapsedMs}
                isEditing={editingMpns.has(part.mpn)}
                urlInput={urlInputs[part.mpn] ?? ''}
                isSubmitting={submittingMpns.has(part.mpn)}
                isReIdentifying={reIdentifyingMpns.has(part.mpn)}
                confirmingOverwrite={confirmingOverwriteMpns.has(part.mpn)}
                onViewModel={() => setModelDrawerMpn(part.mpn)}
                onToggleEdit={() => toggleEditing(part.mpn)}
                onUrlChange={(v) => setUrlInputs(prev => ({ ...prev, [part.mpn]: v }))}
                onSubmitUrl={() => handleSubmitUrl(part.mpn)}
                onReIdentify={() => handleReIdentify(part.mpn, part.has_model)}
                onConfirmOverwrite={() => triggerReIdentify(part.mpn)}
                onCancelOverwrite={() => setConfirmingOverwriteMpns(prev => { const n = new Set(prev); n.delete(part.mpn); return n; })}
              />
            );
          })}
        </div>
      )}

      {/* Continue */}
      {status.complete && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <button
            onClick={handleContinue}
            className="flex items-center gap-2 bg-blue-500 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-600 transition-colors shadow-sm"
          >
            Continue to Part Review
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      <PartModelDrawer
        designId={sessionId}
        mpn={modelDrawerMpn ?? ''}
        isOpen={modelDrawerMpn !== null}
        onClose={() => setModelDrawerMpn(null)}
      />
    </div>
  );
}
