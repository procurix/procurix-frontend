/**
 * Three-column post-upload view:
 *   Left  — collapsible parts sidebar (categories with counts, drilldown to parts)
 *   Center — chat console: streaming progress + free-text refinement
 *   Right — system type suggestion cards
 *
 * Internal phasing the user doesn't need to understand:
 *   1. Identification — kicks off identifyPartsStream as soon as we mount.
 *      Parts populate the sidebar live; suggestion pane shows a waiting state.
 *   2. System analysis — once identification finishes (or if it was already
 *      done), kick off analyzeSystemStream. Suggestions stream into the right
 *      pane.
 *
 * Both phases share the chat console. User can type refinement context for
 * system analysis (re-runs analyzeSystemStream with additional_context).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/app/shared/components/ui/button';
import {
  analyzeSystemStream,
  confirmWebPart,
  getCurrentStage,
  getParts,
  getSystemAnalysis,
  identifyPartsStream,
  saveCustomPart,
  selectPartMatch,
  selectSystemType,
  type DesignPart,
  type PartCandidate,
  type SystemSuggestion,
  type WebCandidate,
} from '@/app/services/api';

interface PostUploadSystemIdProps {
  sessionId: string;
  bomFileName: string;
  partCount: number;
  /** Called when the user confirms a system type AND wants to advance. */
  onProceed: () => void;
}

interface ChatLine {
  id: string;
  type: 'system' | 'user' | 'output' | 'error';
  content: string;
}

interface PartRow {
  mpn: string;
  category: string | null;
  description: string | null;
  source: string | null;
  status: 'identified' | 'searching' | 'web_found' | 'not_found' | 'pending';
  designators: string[];
}

/** Parts that need user attention before they can move forward. Captured as
 *  identification streams; user resolves them via a modal before "Confirm &
 *  Continue" becomes enabled. */
interface UnresolvedPart {
  mpn: string;
  type: 'web_found' | 'not_found' | 'multi_match';
  /** Candidates for web_found / multi_match. Each candidate is a
   *  Nexar/Datasheets-style record the user can pick from. */
  candidates: PartCandidate[];
  webCandidates: WebCandidate[];
  description: string | null;
  source: string | null;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'border-green-300 bg-green-50 text-green-800',
  medium: 'border-blue-300 bg-blue-50 text-blue-800',
  low: 'border-gray-300 bg-gray-50 text-gray-700',
};

type InternalPhase = 'identifying' | 'analyzing' | 'awaiting_confirm';

export function PostUploadSystemId({
  sessionId,
  bomFileName,
  partCount,
  onProceed,
}: PostUploadSystemIdProps) {
  // ── Parts sidebar state ─────────────────────────────────────────────────
  // Keyed by MPN so identification stream events can upsert by MPN.
  const [partRows, setPartRows] = useState<Map<string, PartRow>>(new Map());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // ── Phase + analysis state ──────────────────────────────────────────────
  const [phase, setPhase] = useState<InternalPhase>('identifying');
  const [identifyProgress, setIdentifyProgress] = useState<{ done: number; total: number } | null>(null);
  const [suggestions, setSuggestions] = useState<SystemSuggestion[]>([]);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const initiatedRef = useRef(false);

  // ── Unresolved parts ────────────────────────────────────────────────────
  const [unresolved, setUnresolved] = useState<UnresolvedPart[]>([]);
  const [resolvingMpn, setResolvingMpn] = useState<string | null>(null);
  /** Right-pane mode: 'resolve' until everything is resolved, then 'system'. */
  const [rightMode, setRightMode] = useState<'resolve' | 'system'>('system');
  const [skipUnresolved, setSkipUnresolved] = useState(false);
  // Once identification finishes, we may be blocked on resolution. This flag
  // says "as soon as it's safe, run system analysis." A separate effect picks
  // up on it when unresolved hits zero (or the user toggles skip).
  const [analysisPending, setAnalysisPending] = useState(false);
  const analysisStartedRef = useRef(false);

  // ── Chat state ──────────────────────────────────────────────────────────
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const consoleBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pushLine = useCallback((type: ChatLine['type'], content: string) => {
    setLines(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type, content }]);
  }, []);

  // Scroll chat to bottom on new lines.
  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, analysisRunning]);

  // Hydrate the parts sidebar with anything already in the DB. Identification
  // events will upsert these rows as they stream in.
  const hydrateParts = useCallback((dbParts: DesignPart[]) => {
    setPartRows(prev => {
      const next = new Map(prev);
      for (const p of dbParts) {
        const mpn = (p.selected_mpn || p.mpn || '').trim();
        if (!mpn) continue;
        const existing = next.get(mpn);
        const status: PartRow['status'] =
          p.identification_status === 'identified' ? 'identified'
          : p.identification_status === 'web_unresolved' ? 'web_found'
          : p.identification_status === 'not_found' ? 'not_found'
          : 'pending';
        const designators = existing?.designators
          ? Array.from(new Set([...existing.designators, p.designator].filter(Boolean) as string[]))
          : (p.designator ? [p.designator] : []);
        next.set(mpn, {
          mpn,
          category: existing?.category ?? p.category ?? null,
          description: existing?.description ?? null,
          source: existing?.source ?? null,
          status,
          designators,
        });
      }
      return next;
    });
  }, []);

  // ── Identification stream ───────────────────────────────────────────────
  const runIdentification = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;
    pushLine('system', `Identifying ${partCount} part${partCount === 1 ? '' : 's'}…`);
    let succeeded = false;
    try {
      await identifyPartsStream(sessionId, (event) => {
        if (event.type === 'start') {
          setIdentifyProgress({ done: 0, total: event.total });
        } else if (event.type === 'cache_pass') {
          pushLine('output', `${event.cached_count} cached, ${event.remaining} new`);
        } else if (event.type === 'external_lookup_start') {
          pushLine('output', `Looking up ${event.count} via external sources…`);
        } else if (event.type === 'searching') {
          setPartRows(prev => {
            const next = new Map(prev);
            const existing = next.get(event.mpn);
            next.set(event.mpn, {
              mpn: event.mpn,
              category: existing?.category ?? null,
              description: existing?.description ?? null,
              source: existing?.source ?? null,
              status: 'searching',
              designators: existing?.designators ?? [],
            });
            return next;
          });
        } else if (event.type === 'found') {
          setPartRows(prev => {
            const next = new Map(prev);
            const existing = next.get(event.mpn);
            next.set(event.mpn, {
              mpn: event.mpn,
              category: event.category,
              description: event.description,
              source: event.source,
              status: 'identified',
              designators: existing?.designators ?? [],
            });
            return next;
          });
          setIdentifyProgress(prev => prev && { ...prev, done: prev.done + 1 });
        } else if (event.type === 'web_found') {
          setPartRows(prev => {
            const next = new Map(prev);
            const existing = next.get(event.mpn);
            next.set(event.mpn, {
              mpn: event.mpn,
              category: existing?.category ?? null,
              description: null,
              source: event.source,
              status: 'web_found',
              designators: existing?.designators ?? [],
            });
            return next;
          });
          setUnresolved(prev => prev.some(u => u.mpn === event.mpn) ? prev : [
            ...prev,
            {
              mpn: event.mpn,
              type: 'web_found',
              candidates: [],
              webCandidates: event.candidates,
              description: null,
              source: event.source,
            },
          ]);
          setIdentifyProgress(prev => prev && { ...prev, done: prev.done + 1 });
        } else if (event.type === 'not_found') {
          setPartRows(prev => {
            const next = new Map(prev);
            const existing = next.get(event.mpn);
            next.set(event.mpn, {
              mpn: event.mpn,
              category: existing?.category ?? null,
              description: null,
              source: null,
              status: 'not_found',
              designators: existing?.designators ?? [],
            });
            return next;
          });
          setUnresolved(prev => prev.some(u => u.mpn === event.mpn) ? prev : [
            ...prev,
            {
              mpn: event.mpn,
              type: 'not_found',
              candidates: [],
              webCandidates: [],
              description: null,
              source: null,
            },
          ]);
          setIdentifyProgress(prev => prev && { ...prev, done: prev.done + 1 });
        } else if (event.type === 'complete') {
          succeeded = true;
          pushLine('system',
            `Identification complete — ${event.identified}/${event.total} identified` +
            (event.review_blockers ? `, ${event.review_blockers} need review` : ''));
        } else if (event.type === 'error') {
          pushLine('error', event.message);
        }
      });
    } catch (err) {
      pushLine('error', err instanceof Error ? err.message : 'Identification failed');
    }
    return succeeded;
  }, [partCount, pushLine, sessionId]);

  // ── System analysis stream ──────────────────────────────────────────────
  const runAnalysis = useCallback(async (additionalContext?: string) => {
    if (!sessionId || analysisRunning) return;
    setAnalysisRunning(true);
    setSelectedIndex(null);
    const inFlight: SystemSuggestion[] = [];
    try {
      pushLine('system', additionalContext
        ? `Refining with context: "${additionalContext}"`
        : 'Analyzing BOM to suggest system types…');
      await analyzeSystemStream(sessionId, additionalContext, (event) => {
        if (event.type === 'suggestion') {
          inFlight[event.index] = event.suggestion;
          setSuggestions([...inFlight].filter(Boolean));
          if (event.index === 0) {
            pushLine('output', `→ ${event.suggestion.systemType} (${event.suggestion.confidence})`);
          }
        } else if (event.type === 'cache_hit') {
          pushLine('system', `Loaded ${event.count} cached suggestion${event.count === 1 ? '' : 's'}.`);
          setSuggestions(event.suggestions);
        } else if (event.type === 'complete') {
          setSuggestions(event.suggestions);
          pushLine('system', `Generated ${event.count} suggestion${event.count === 1 ? '' : 's'}. Pick one or refine.`);
        } else if (event.type === 'error') {
          pushLine('error', event.message);
          throw new Error(event.message);
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 409 from the backend: parts still need identification review. This is
      // expected when the user lands here with unresolved parts; not an error.
      // Surface it gently and queue the retry for when resolution completes.
      if (/identification review/i.test(msg)) {
        pushLine('system',
          'System analysis is waiting until parts needing review are resolved. ' +
          'Resolve them (or check "Skip remaining") to start analysis.');
        setAnalysisPending(true);
        analysisStartedRef.current = false;
        return;
      }
      // Best-effort fallback for other errors: hydrate any persisted analysis
      try {
        const existing = await getSystemAnalysis(sessionId);
        if (existing.suggestions?.length) {
          setSuggestions(existing.suggestions);
          pushLine('system', `Loaded ${existing.suggestions.length} existing suggestion(s).`);
        } else {
          pushLine('error', msg || 'System analysis failed; retry from chat.');
        }
      } catch {
        pushLine('error', msg || 'System analysis failed; retry from chat.');
      }
    } finally {
      setAnalysisRunning(false);
      setPhase('awaiting_confirm');
      inputRef.current?.focus();
    }
  }, [analysisRunning, pushLine, sessionId]);

  // ── Orchestration: identify → analyze ───────────────────────────────────
  useEffect(() => {
    if (!sessionId || initiatedRef.current) return;
    initiatedRef.current = true;

    (async () => {
      // Hydrate sidebar with what's already in the DB, then check FSM state to
      // decide what to do next.
      try {
        const dbParts = await getParts(sessionId);
        hydrateParts(dbParts);
      } catch (err) {
        console.error('Failed to load parts', err);
      }

      let stage: number | null = null;
      try {
        const s = await getCurrentStage(sessionId);
        stage = s.current_stage;
      } catch {
        // ignore — treat as fresh
      }

      // Stage 1 = upload — need identification first. Stage 2+ = already identified
      // (potentially also analyzed), so we can skip straight to analysis or hydrate
      // existing suggestions.
      if (stage !== null && stage >= 2) {
        // Try hydrating persisted suggestions first
        try {
          const existing = await getSystemAnalysis(sessionId);
          if (existing.suggestions?.length) {
            setSuggestions(existing.suggestions);
            pushLine('system', `Loaded ${existing.suggestions.length} existing suggestion(s) for this BOM.`);
            setPhase('awaiting_confirm');
            return;
          }
        } catch {
          // no persisted analysis — fall through to fresh analysis
        }
        setPhase('analyzing');
        await runAnalysis();
        return;
      }

      // Fresh design: run identification first, then queue analysis. We
      // intentionally don't await runAnalysis() here when unresolved > 0 —
      // the backend will 409 ("parts still need identification review"). A
      // separate effect picks up the pending flag when unresolved hits zero.
      const idSucceeded = await runIdentification();
      // Refresh parts from DB to pick up any classification/category data added
      // during the identification commit step.
      try {
        const refreshed = await getParts(sessionId);
        hydrateParts(refreshed);
      } catch { /* ignore */ }
      if (idSucceeded) {
        // Use the unresolved length at this point (after identification
        // finished) to decide whether to start analysis now or wait.
        setUnresolved(prev => {
          if (prev.length > 0) {
            setRightMode('resolve');
            setAnalysisPending(true);
            pushLine('system',
              `${prev.length} part${prev.length === 1 ? '' : 's'} need review before system analysis can run. ` +
              'Resolve them or check "Skip remaining" to continue.');
          } else {
            // No unresolved — go straight to analysis.
            setPhase('analyzing');
            analysisStartedRef.current = true;
            void runAnalysis();
          }
          return prev;
        });
      } else {
        // Identification failed — let user see the error in chat and stay
        // on the identifying phase so they know what went wrong.
        setPhase('identifying');
      }
    })();
    // Only orchestrate once per session. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Auto-trigger analysis when blockers clear ───────────────────────────
  // When `analysisPending` is true (identification finished but we were
  // blocked by unresolved parts), this effect watches unresolved + skip.
  // Once it's safe (everything resolved OR user opted to skip), fire analysis.
  useEffect(() => {
    if (!analysisPending) return;
    if (analysisStartedRef.current) return;
    if (analysisRunning) return;
    const safeToStart = unresolved.length === 0 || skipUnresolved;
    if (!safeToStart) return;
    analysisStartedRef.current = true;
    setAnalysisPending(false);
    setPhase('analyzing');
    void runAnalysis();
  }, [analysisPending, analysisRunning, unresolved.length, skipUnresolved, runAnalysis]);

  // ── Refinement chat ─────────────────────────────────────────────────────
  const sendRefinement = async () => {
    const text = input.trim();
    if (!text || analysisRunning || phase === 'identifying') return;
    pushLine('user', text);
    setInput('');
    setPhase('analyzing');
    await runAnalysis(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendRefinement();
    }
  };

  // ── Resolution handlers ─────────────────────────────────────────────────
  const markResolved = useCallback((mpn: string, displayCategory: string | null, displayDescription: string | null) => {
    setUnresolved(prev => prev.filter(u => u.mpn !== mpn));
    setPartRows(prev => {
      const next = new Map(prev);
      const existing = next.get(mpn);
      next.set(mpn, {
        mpn,
        category: displayCategory ?? existing?.category ?? null,
        description: displayDescription ?? existing?.description ?? null,
        source: existing?.source ?? 'user_confirmed',
        status: 'identified',
        designators: existing?.designators ?? [],
      });
      return next;
    });
  }, []);

  const resolveSelectMatch = useCallback(async (mpn: string, candidate: PartCandidate) => {
    if (!sessionId) return;
    try {
      await selectPartMatch(sessionId, mpn, candidate);
      markResolved(mpn, candidate.category ?? null, candidate.description ?? null);
      toast.success(`${mpn} resolved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve part');
    } finally {
      setResolvingMpn(null);
    }
  }, [markResolved, sessionId]);

  const resolveWebPart = useCallback(async (mpn: string, candidate: WebCandidate) => {
    if (!sessionId) return;
    try {
      await confirmWebPart(
        sessionId,
        mpn,
        candidate.product_url ?? null,
        candidate.datasheet_url ?? null,
        candidate.description ?? null,
      );
      markResolved(mpn, candidate.category ?? null, candidate.description ?? null);
      toast.success(`${mpn} resolved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm web match');
    } finally {
      setResolvingMpn(null);
    }
  }, [markResolved, sessionId]);

  const resolveCustom = useCallback(async (mpn: string, fields: {
    manufacturer?: string;
    description?: string;
    category?: string;
  }) => {
    if (!sessionId) return;
    try {
      await saveCustomPart(sessionId, mpn, fields);
      markResolved(mpn, fields.category ?? null, fields.description ?? null);
      toast.success(`${mpn} added manually`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save part');
    } finally {
      setResolvingMpn(null);
    }
  }, [markResolved, sessionId]);

  const resolvingPart = unresolved.find(u => u.mpn === resolvingMpn) || null;

  // ── Confirm + proceed ───────────────────────────────────────────────────
  const canProceed =
    selectedIndex !== null
    && !confirming
    && !analysisRunning
    && phase !== 'identifying'
    && (unresolved.length === 0 || skipUnresolved);

  const handleConfirm = async () => {
    if (selectedIndex === null || !sessionId) return;
    if (unresolved.length > 0 && !skipUnresolved) {
      toast.error(`${unresolved.length} part${unresolved.length === 1 ? '' : 's'} still need review`);
      setRightMode('resolve');
      return;
    }
    setConfirming(true);
    try {
      await selectSystemType(sessionId, selectedIndex);
      const chosen = suggestions[selectedIndex];
      toast.success(`System type confirmed: ${chosen.systemType}`);
      onProceed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  // ── Derived: parts grouped by category for sidebar ──────────────────────
  const partsByCategory = useMemo(() => {
    const out = new Map<string, PartRow[]>();
    for (const row of partRows.values()) {
      const cat = row.category || (row.status === 'searching' ? 'Identifying…' : 'Uncategorized');
      if (!out.has(cat)) out.set(cat, []);
      out.get(cat)!.push(row);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [partRows]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const identifyingDone = identifyProgress?.done ?? 0;
  const identifyingTotal = identifyProgress?.total ?? partCount;
  const identifyingPct = identifyingTotal > 0
    ? Math.round((identifyingDone / identifyingTotal) * 100)
    : 0;

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left: Parts sidebar ────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">BOM</div>
          <div className="mt-1 text-sm font-medium text-gray-900 truncate" title={bomFileName}>
            {bomFileName}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {partCount} part{partCount === 1 ? '' : 's'}
            {partsByCategory.length > 0 && ` · ${partsByCategory.length} categor${partsByCategory.length === 1 ? 'y' : 'ies'}`}
          </div>
          {phase === 'identifying' && identifyProgress && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>Identifying</span>
                <span>{identifyingDone}/{identifyingTotal}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${identifyingPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {partRows.size === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading parts…
            </div>
          )}
          {partsByCategory.map(([cat, items]) => {
            const expanded = expandedCategories.has(cat);
            return (
              <div key={cat} className="border-b border-gray-50">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-gray-50"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {expanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
                    )}
                    <span className="text-xs font-medium text-gray-700 truncate">{cat}</span>
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                    {items.length}
                  </span>
                </button>
                {expanded && (
                  <div className="bg-gray-50/50 pb-1">
                    {items.slice(0, 50).map(part => (
                      <div key={part.mpn} className="px-7 py-1 text-[11px] text-gray-600">
                        <div className="flex items-center gap-1">
                          {part.status === 'searching' && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400 shrink-0" />
                          )}
                          {part.status === 'identified' && (
                            <span className="text-green-500 text-[10px] shrink-0">●</span>
                          )}
                          {part.status === 'web_found' && (
                            <span className="text-amber-500 text-[10px] shrink-0">●</span>
                          )}
                          {part.status === 'not_found' && (
                            <span className="text-red-400 text-[10px] shrink-0">●</span>
                          )}
                          <span className="font-mono truncate">{part.mpn}</span>
                        </div>
                        {part.designators.length > 0 && (
                          <div className="ml-3.5 text-[10px] text-gray-400">
                            {part.designators.slice(0, 4).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length > 50 && (
                      <div className="px-7 py-1 text-[10px] text-gray-400 italic">
                        +{items.length - 50} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Center: Chat console ───────────────────────────────────────── */}
      <main className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-white">
        <div className="shrink-0 px-6 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {phase === 'identifying' && 'Identifying Parts'}
            {phase === 'analyzing' && 'Identifying System Type'}
            {phase === 'awaiting_confirm' && 'Pick a System Type'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {phase === 'identifying'
              ? 'Looking up each MPN in Nexar, Datasheets.com, and the web.'
              : phase === 'analyzing'
              ? 'AI is analyzing the BOM to suggest what kind of system this is.'
              : 'Pick a suggested system type, or refine with the chat below.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 font-mono text-sm">
          <AnimatePresence initial={false}>
            {lines.map(line => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.1 }}
                className="leading-relaxed"
              >
                {line.type === 'user' && (
                  <div className="flex gap-2">
                    <span className="text-blue-500 select-none shrink-0">❯</span>
                    <span className="text-gray-800">{line.content}</span>
                  </div>
                )}
                {line.type === 'output' && (
                  <div className="text-gray-600 whitespace-pre-wrap pl-5">{line.content}</div>
                )}
                {line.type === 'system' && (
                  <div className="text-blue-600 pl-5">{line.content}</div>
                )}
                {line.type === 'error' && (
                  <div className="text-red-500 pl-5">{line.content}</div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {(phase === 'identifying' || analysisRunning) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pl-5 flex items-center gap-2 text-gray-400"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{phase === 'identifying' ? 'Identifying…' : 'Analyzing…'}</span>
            </motion.div>
          )}
          <div ref={consoleBottomRef} />
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={phase === 'identifying' || analysisRunning}
              placeholder={
                phase === 'identifying'
                  ? 'Waiting for identification…'
                  : analysisRunning
                  ? 'Analyzing…'
                  : "It's actually a BMS, not a motor controller…"
              }
              className="flex-1 h-9 rounded-md border border-gray-300 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void sendRefinement()}
              disabled={!input.trim() || phase === 'identifying' || analysisRunning}
              className="h-9"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </main>

      {/* ── Right: Resolve unresolved parts OR system suggestions ──────── */}
      <aside className="w-[400px] shrink-0 flex flex-col bg-white">
        {/* Tab switcher when both modes are relevant */}
        {unresolved.length > 0 && (
          <div className="shrink-0 flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setRightMode('resolve')}
              className={`flex-1 px-3 py-2 text-xs font-medium ${
                rightMode === 'resolve'
                  ? 'border-b-2 border-amber-500 text-amber-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Resolve
              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                {unresolved.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRightMode('system')}
              className={`flex-1 px-3 py-2 text-xs font-medium ${
                rightMode === 'system'
                  ? 'border-b-2 border-blue-500 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              System Type
              {selectedIndex !== null && (
                <CheckCircle className="ml-1.5 inline h-3 w-3 text-green-500" />
              )}
            </button>
          </div>
        )}

        {rightMode === 'resolve' && unresolved.length > 0 ? (
          <>
            <div className="shrink-0 px-4 py-3 border-b border-gray-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Parts Needing Review
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {unresolved.length} part{unresolved.length === 1 ? '' : 's'} couldn't be identified
                automatically. Resolve them before continuing.
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {unresolved.map(u => (
                <div
                  key={u.mpn}
                  className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-gray-900 truncate">
                        {u.mpn}
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                        {u.type === 'web_found' && `${u.webCandidates.length} web match${u.webCandidates.length === 1 ? '' : 'es'}`}
                        {u.type === 'multi_match' && `${u.candidates.length} candidate${u.candidates.length === 1 ? '' : 's'}`}
                        {u.type === 'not_found' && 'Not found — add manually'}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setResolvingMpn(u.mpn)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-3 space-y-2">
              <label className="flex items-start gap-2 text-[11px] text-gray-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={skipUnresolved}
                  onChange={e => setSkipUnresolved(e.target.checked)}
                />
                <span>
                  Skip remaining {unresolved.length} — I'll handle them later.
                </span>
              </label>
              {unresolved.length === 0 && (
                <Button
                  type="button"
                  onClick={() => setRightMode('system')}
                  className="w-full gap-2"
                >
                  Continue to System Type <CheckCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0 px-4 py-3 border-b border-gray-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Suggestions
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {phase === 'identifying' && 'Waiting for identification to finish.'}
                {phase !== 'identifying' && analysisPending && unresolved.length > 0 && !skipUnresolved &&
                  `Waiting on ${unresolved.length} part${unresolved.length === 1 ? '' : 's'} needing review.`}
                {phase !== 'identifying' && !analysisPending && suggestions.length === 0 && !analysisRunning && 'No suggestions yet.'}
                {suggestions.length > 0 && `${suggestions.length} candidate${suggestions.length === 1 ? '' : 's'}`}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {phase === 'identifying' && (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-500">
                  Suggestions will appear once part identification is complete.
                </div>
              )}
              {phase !== 'identifying' && analysisPending && unresolved.length > 0 && !skipUnresolved && (
                <div className="rounded-md border border-dashed border-amber-200 bg-amber-50/50 px-3 py-4 text-center text-[11px] text-amber-700">
                  Resolve {unresolved.length} part{unresolved.length === 1 ? '' : 's'} in the
                  Resolve tab — or check "Skip remaining" — to start system analysis.
                </div>
              )}
              {suggestions.map((s, i) => {
                const isSelected = i === selectedIndex;
                const confidenceStyle =
                  CONFIDENCE_STYLES[String(s.confidence).toLowerCase()] || CONFIDENCE_STYLES.low;
                return (
                  <button
                    key={`${s.systemType}-${i}`}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={`w-full text-left rounded-lg border-2 p-3 transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">{s.systemType}</div>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${confidenceStyle}`}>
                        {s.confidence}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-600">{s.primaryFunction}</div>
                    {s.keyArchitecturalClues?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.keyArchitecturalClues.slice(0, 3).map(clue => (
                          <span
                            key={clue}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                          >
                            {clue}
                          </span>
                        ))}
                      </div>
                    )}
                    {isSelected && s.reasoning && (
                      <div className="mt-2 text-[11px] text-gray-600 leading-snug">{s.reasoning}</div>
                    )}
                  </button>
                );
              })}
              {analysisRunning && suggestions.length === 0 && phase !== 'identifying' && (
                <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating…
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 px-4 py-3">
              {unresolved.length > 0 && !skipUnresolved && (
                <div className="mb-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800">
                  {unresolved.length} part{unresolved.length === 1 ? '' : 's'} still need review.
                </div>
              )}
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!canProceed}
                className="w-full gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {confirming ? 'Confirming…' : 'Confirm & Continue'}
              </Button>
              {selectedIndex === null && suggestions.length > 0 && (
                <p className="mt-2 text-center text-[10px] text-gray-400">
                  Pick a system type above to enable.
                </p>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Resolution modal ──────────────────────────────────────────── */}
      {resolvingPart && (
        <ResolveModal
          part={resolvingPart}
          onCancel={() => setResolvingMpn(null)}
          onSelectMatch={(candidate) => resolveSelectMatch(resolvingPart.mpn, candidate)}
          onConfirmWeb={(candidate) => resolveWebPart(resolvingPart.mpn, candidate)}
          onSaveCustom={(fields) => resolveCustom(resolvingPart.mpn, fields)}
        />
      )}
    </div>
  );
}

// ── Resolution modal ────────────────────────────────────────────────────────

interface ResolveModalProps {
  part: UnresolvedPart;
  onCancel: () => void;
  onSelectMatch: (candidate: PartCandidate) => void;
  onConfirmWeb: (candidate: WebCandidate) => void;
  onSaveCustom: (fields: { manufacturer?: string; description?: string; category?: string }) => void;
}

function ResolveModal({ part, onCancel, onSelectMatch, onConfirmWeb, onSaveCustom }: ResolveModalProps) {
  const [manualMfg, setManualMfg] = useState('');
  const [manualCat, setManualCat] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-amber-700">Resolve part</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-gray-900">{part.mpn}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {part.type === 'web_found' && part.webCandidates.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-gray-700">
                Web candidates — pick the right one
              </div>
              <div className="space-y-2">
                {part.webCandidates.map((c, i) => (
                  <button
                    key={`${c.mpn}-${i}`}
                    type="button"
                    onClick={() => onConfirmWeb(c)}
                    className="w-full text-left rounded-md border border-gray-200 p-3 hover:border-blue-400 hover:bg-blue-50"
                  >
                    <div className="font-mono text-xs font-semibold text-gray-900">{c.mpn}</div>
                    {c.manufacturer && (
                      <div className="mt-0.5 text-[11px] text-gray-600">{c.manufacturer}</div>
                    )}
                    {c.description && (
                      <div className="mt-1 text-[11px] text-gray-500 line-clamp-2">{c.description}</div>
                    )}
                    <div className="mt-1 flex gap-2 text-[10px] text-gray-400">
                      <span>source: {c.source}</span>
                      {typeof c.confidence === 'number' && (
                        <span>· confidence: {(c.confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {part.type === 'multi_match' && part.candidates.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-gray-700">
                Multiple matches — pick one
              </div>
              <div className="space-y-2">
                {part.candidates.map((c, i) => (
                  <button
                    key={`${c.mpn}-${i}`}
                    type="button"
                    onClick={() => onSelectMatch(c)}
                    className="w-full text-left rounded-md border border-gray-200 p-3 hover:border-blue-400 hover:bg-blue-50"
                  >
                    <div className="font-mono text-xs font-semibold text-gray-900">{c.mpn}</div>
                    {c.manufacturer && (
                      <div className="mt-0.5 text-[11px] text-gray-600">{c.manufacturer}</div>
                    )}
                    {c.description && (
                      <div className="mt-1 text-[11px] text-gray-500 line-clamp-2">{c.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual entry — always available as a fallback */}
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-700">
              {part.type === 'not_found' ? 'Add manually' : 'Or add manually'}
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={manualMfg}
                onChange={e => setManualMfg(e.target.value)}
                placeholder="Manufacturer (optional)"
                className="w-full h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                type="text"
                value={manualCat}
                onChange={e => setManualCat(e.target.value)}
                placeholder="Category (e.g. Ceramic Capacitor)"
                className="w-full h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <textarea
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full rounded-md border border-gray-300 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => onSaveCustom({
                  manufacturer: manualMfg.trim() || undefined,
                  category: manualCat.trim() || undefined,
                  description: manualDesc.trim() || undefined,
                })}
                disabled={!manualMfg.trim() && !manualCat.trim() && !manualDesc.trim()}
                className="w-full"
              >
                Save manual entry
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
