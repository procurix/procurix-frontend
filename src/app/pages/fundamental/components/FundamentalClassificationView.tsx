import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Component } from '@/app/types';
import type { PartDetail } from '@/app/services/api';
import { CheckCircle, Cpu, Zap, AlertCircle, Loader2, Search, X, ArrowRight, RotateCcw, ExternalLink, ChevronDown, RefreshCw, MessageSquare, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { classifyPartsStream, classifyPartsStreamParallel, selectPartMatch, getClassification, bulkUpdateClassification, confirmWebPart, saveCustomPart, suggestPartFields, triggerModelEnrichment, getModelEnrichmentStatus, updatePartDatasheetUrl, type PartEnrichmentDetail, type PartEnrichmentState } from '@/app/services/api';
import { PartModelDrawer } from '@/app/shared/components/PartModelDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'research' | 'selection' | 'classify';

interface StreamLine {
  id: string;
  mpn?: string;
  icon: 'spin' | 'check' | 'miss' | 'web' | 'cached' | 'classify';
  text: string;
  meta?: string;   // category · manufacturer
  source?: string; // nexar / tavily / cache / web
  multiMatch?: boolean;
  webFound?: boolean;
  notFound?: boolean;
  classification?: 'non-auxiliary' | 'auxiliary' | null;
}

// Carries enrichment result for parts needing user action in selection phase
interface PartEnrichmentResult {
  mpn: string;
  status: 'multi_match' | 'web_found' | 'not_found';
  description?: string | null;
  datasheet_url?: string | null;
  product_url?: string | null;
  source?: string;
  confidence?: string;
  candidates?: import('@/app/services/api').PartCandidate[];
}

interface FundamentalClassificationViewProps {
  components: Component[];
  onClassificationComplete: (classifiedComponents: Component[]) => void;
  /** When true, skip Research/Selection and start directly in ClassifyPhase. */
  forceClassifyPhase?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function srcBadge(source: string | undefined | null) {
  if (!source || source === 'unknown') return null;
  const styles: Record<string, string> = {
    nexar: 'bg-blue-50 text-blue-600 border-blue-200',
    nexar_confirmed: 'bg-green-50 text-green-600 border-green-200',
    tavily: 'bg-purple-50 text-purple-600 border-purple-200',
    cache: 'bg-gray-50 text-gray-500 border-gray-200',
    combined: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    web: 'bg-purple-50 text-purple-600 border-purple-200',
    web_broad: 'bg-orange-50 text-orange-600 border-orange-200',
    web_confirmed: 'bg-teal-50 text-teal-600 border-teal-200',
    user_provided: 'bg-green-50 text-green-700 border-green-300',
  };
  const label: Record<string, string> = {
    nexar: 'nexar', nexar_confirmed: 'confirmed', tavily: 'tavily',
    cache: 'cached', combined: 'nexar+web',
    web: 'web', web_broad: 'ai search', web_confirmed: 'web ✓',
    user_provided: 'manual',
  };
  const cls = styles[source] ?? styles.cache;
  return (
    <span className={`inline-block border text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {label[source] ?? source}
    </span>
  );
}

// ── PartCard (module-level, memoized) ─────────────────────────────────────────
// 2026-06-10: PartCard used to be defined inside ClassifyPhase, which meant
// every poll-driven re-render gave it a brand-new component identity — React
// would unmount and remount every card, producing the "page refreshes every
// 3 seconds" effect once enrichment polling kicked in. Lifting it to module
// scope and memoizing on the props it actually uses fixes that.

type PartCardSide = 'fund' | 'aux';
type EnrichmentDisplayStatus = PartEnrichmentState | 'pending' | 'skipped';

interface PartCardProps {
  comp: Component;
  side: PartCardSide;
  detail: PartDetail | null;
  enrichStatus: EnrichmentDisplayStatus;
  enrichmentStarted: boolean;
  lockMoves: boolean;
  onMove: (id: string, toAux: boolean) => void;
  onOpenErrorModal: (mpn: string) => void;
  onOpenModel?: () => void;
}

const PartCardBase = ({
  comp,
  side,
  detail,
  enrichStatus,
  enrichmentStarted,
  lockMoves,
  onMove,
  onOpenErrorModal,
  onOpenModel,
}: PartCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasCandidates = (detail?.candidates?.length ?? 0) > 1;

  const mpn = comp.partNumber || '';
  const isLockedForMove = lockMoves;
  const dimAsAux = side === 'aux' && lockMoves;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`rounded-lg border p-2.5 transition-all group ${
        isLockedForMove ? 'cursor-default' : 'cursor-pointer'
      } ${dimAsAux ? 'bg-gray-50 opacity-60' : 'bg-white'} ${
        side === 'fund' ? 'border-blue-200 hover:border-blue-400' : 'border-gray-200 hover:border-gray-400'
      } ${
        enrichStatus === 'failed' || enrichStatus === 'no_datasheet'
          ? 'border-red-300 bg-red-50/40'
          : ''
      }`}
      onClick={() => {
        if (isLockedForMove) {
          if (enrichStatus === 'extracting') {
            toast.message(`${mpn} is enriching — please wait`);
          }
          return;
        }
        onMove(comp.id, side === 'aux');
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {side === 'fund' && enrichmentStarted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (enrichStatus === 'failed' || enrichStatus === 'no_datasheet') {
                    onOpenErrorModal(mpn);
                  }
                }}
                className={`shrink-0 ${
                  enrichStatus === 'failed' || enrichStatus === 'no_datasheet' ? 'cursor-pointer' : 'cursor-default'
                }`}
                title={
                  enrichStatus === 'extracting' ? 'Extracting datasheet…'
                  : enrichStatus === 'done' ? 'Extraction complete'
                  : enrichStatus === 'failed' ? 'Extraction failed — click to resolve'
                  : enrichStatus === 'no_datasheet' ? 'No datasheet — click to provide one'
                  : enrichStatus === 'skipped' ? 'Skipped'
                  : 'Queued'
                }
              >
                {enrichStatus === 'extracting' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                {enrichStatus === 'done' && <CheckCircle className="h-3 w-3 text-green-500" />}
                {enrichStatus === 'failed' && <AlertCircle className="h-3 w-3 text-red-500" />}
                {enrichStatus === 'no_datasheet' && <AlertCircle className="h-3 w-3 text-orange-500" />}
                {enrichStatus === 'skipped' && <X className="h-3 w-3 text-gray-400" />}
                {enrichStatus === 'pending' && <Loader2 className="h-3 w-3 text-gray-300" />}
              </button>
            )}
            <span className={`font-mono text-xs font-semibold ${side === 'fund' ? 'text-blue-800' : 'text-gray-700'}`}>
              {comp.partNumber}
            </span>
            {detail && srcBadge(detail.source)}
            {hasCandidates && (
              <button
                onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                className="text-[10px] text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 hover:bg-yellow-100"
              >
                {detail!.candidates.length} matches <ChevronDown className={`h-2.5 w-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {side === 'fund' && onOpenModel && (
              <button
                onClick={e => { e.stopPropagation(); onOpenModel(); }}
                className="text-[10px] text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 hover:bg-blue-100 transition-colors"
                title="View part model"
              >
                <Database className="h-2.5 w-2.5" /> Model
              </button>
            )}
          </div>
          {detail?.category && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{detail.category}</div>}
          {detail?.description && detail.description !== comp.partNumber && (
            <div className="text-[11px] text-gray-400 truncate">{detail.description}</div>
          )}
          {detail?.needs_review && (
            <span className="text-[10px] text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded mt-0.5 inline-block">
              needs review
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5">
          {side === 'fund' ? '→ aux' : '→ fund'}
        </span>
      </div>

      {expanded && hasCandidates && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1" onClick={e => e.stopPropagation()}>
          {detail!.candidates.map((c, i) => (
            <div key={`${c.mpn ?? 'unknown'}-${i}`} className={`text-[11px] rounded px-2 py-1 ${i === 0 ? 'bg-blue-50 text-blue-800' : 'text-gray-600'}`}>
              <span className="font-mono font-medium">{c.mpn}</span>
              {c.category && <span className="text-gray-500 ml-1">· {c.category}</span>}
              {c.is_exact_match && <span className="ml-1 text-green-600">✓ exact</span>}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// Custom equality: cards only re-render when their own visible inputs change.
// detail and onOpenModel are referentially stable from the parent's perspective
// (detail comes from a Map; onOpenModel is created inline per render but cards
// don't care unless side === 'fund' and the mpn changed, which it can't here).
// So we compare the meaningful primitives + the detail reference.
const PartCard = React.memo(PartCardBase, (prev, next) => {
  return (
    prev.comp === next.comp &&
    prev.side === next.side &&
    prev.detail === next.detail &&
    prev.enrichStatus === next.enrichStatus &&
    prev.enrichmentStarted === next.enrichmentStarted &&
    prev.lockMoves === next.lockMoves &&
    prev.onMove === next.onMove &&
    prev.onOpenErrorModal === next.onOpenErrorModal &&
    // onOpenModel changes identity per render — only meaningful for fund cards
    (next.side === 'aux' || (prev.onOpenModel === undefined) === (next.onOpenModel === undefined))
  );
});

// ── Phase 1: Research terminal ─────────────────────────────────────────────────

function ResearchPhase({ sessionId, onComplete }: {
  sessionId: string;
  onComplete: (result: PartDetail[], needsAction: PartEnrichmentResult[]) => void;
}) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  // Collect parts needing user action (multi_match / web_found / not_found)
  const needsActionRef = useRef<PartEnrichmentResult[]>([]);

  const push = (line: StreamLine) =>
    setLines(prev => [...prev, line]);
  const replace = (id: string, update: Partial<StreamLine>) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...update } : l));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    classifyPartsStreamParallel(
      sessionId,
      (event) => {
        if (event.type === 'start') {
          setTotal(event.total);
          push({ id: 'start', icon: 'classify', text: event.message });
        } else if (event.type === 'searching') {
          push({ id: event.mpn, icon: 'spin', text: `Looking up`, mpn: event.mpn });
        // ── Identification replay event types ──
        } else if (event.type === 'exact_match') {
          const meta = [event.category, event.candidates?.[0]?.manufacturer].filter(Boolean).join(' · ');
          replace(event.mpn, {
            icon: 'check',
            text: event.category || 'identified',
            meta,
            source: event.source,
          });
        } else if (event.type === 'multi_match') {
          replace(event.mpn, {
            icon: 'miss',
            text: `${event.candidate_count} candidates — pick one`,
            source: event.source,
            multiMatch: true,
          });
          needsActionRef.current.push({
            mpn: event.mpn, status: 'multi_match',
            description: event.description,
            source: event.source,
            candidates: event.candidates,
          });
        } else if (event.type === 'web_found') {
          replace(event.mpn, {
            icon: 'web',
            text: event.datasheet_url ? 'datasheet found — confirm' : 'web reference found — confirm',
            source: event.source,
            webFound: true,
          });
          needsActionRef.current.push({
            mpn: event.mpn, status: 'web_found',
            description: event.description,
            datasheet_url: event.datasheet_url,
            product_url: event.product_url,
            confidence: event.confidence,
            source: event.source,
          });
        } else if (event.type === 'found' || event.type === 'cached') {
          const meta = [event.category, event.candidates?.[0]?.manufacturer].filter(Boolean).join(' · ');
          const multi = (event.candidates?.length ?? 0) > 1 && !event.candidates?.[0]?.is_exact_match;
          replace(event.mpn, {
            icon: multi ? 'miss' : 'check',
            text: multi ? `${event.candidates!.length} candidates — review needed` : (event.category || 'found'),
            meta,
            source: event.source,
            multiMatch: multi,
          });
          if (multi) {
            needsActionRef.current.push({
              mpn: event.mpn, status: 'multi_match',
              description: event.description ?? null,
              source: event.source,
              candidates: event.candidates,
            });
          }
        } else if (event.type === 'not_found') {
          replace(event.mpn, { icon: 'miss', text: 'not found — add manually', notFound: true });
          needsActionRef.current.push({ mpn: event.mpn, status: 'not_found' });
        // ── New parallel-classify event types ──
        } else if (event.type === 'ready') {
          push({
            id: 'classifying',
            icon: 'classify',
            text: `Classifying ${event.total} parts (${event.batch_count} batches × ${event.batch_size}, ${event.parallel} parallel)…`,
          });
        } else if (event.type === 'classified') {
          // Append the verdict to the part's existing row.
          const tag =
            event.classification === 'non-auxiliary' ? 'fundamental' : 'support';
          replace(event.mpn, {
            meta: event.instance_function || event.reasoning || tag,
            classification: event.classification,
          });
        } else if (event.type === 'batch_failed') {
          push({
            id: `batch_failed_${event.batch_index}`,
            icon: 'miss',
            text: `Batch ${event.batch_index + 1} failed: ${event.message}`,
          });
        } else if (event.type === 'complete') {
          push({
            id: 'done',
            icon: 'check',
            text: `Done — ${event.counts.non_auxiliary} fundamental, ${event.counts.auxiliary} support`,
          });
          setDone(true);
          setTimeout(() => onComplete(event.parts ?? [], needsActionRef.current), 600);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      },
    ).catch(e => setError(String(e)));
  }, []);

  const iconEl = (icon: StreamLine['icon']) => {
    if (icon === 'spin') return <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />;
    if (icon === 'check') return <span className="text-green-500 shrink-0 font-bold text-xs">✓</span>;
    if (icon === 'miss') return <span className="text-yellow-500 shrink-0 font-bold text-xs">?</span>;
    if (icon === 'web') return <span className="text-purple-400 shrink-0 font-bold text-xs">⌂</span>;
    if (icon === 'cached') return <span className="text-blue-400 shrink-0 font-bold text-xs">↩</span>;
    return <span className="text-gray-400 shrink-0 text-xs">·</span>;
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 font-mono text-sm">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-gray-300 text-xs font-semibold tracking-wide">PART RESEARCH</span>
        {total > 0 && (
          <span className="text-gray-500 text-xs">{Math.min(lines.filter(l => l.mpn).length, total)} / {total}</span>
        )}
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
        <AnimatePresence initial={false}>
          {lines.map(line => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.08 }}
              className="flex items-start gap-3"
            >
              <div className="mt-0.5 w-4 flex justify-center">{iconEl(line.icon)}</div>
              <div className="flex-1 min-w-0">
                {line.mpn && (
                  <span className="text-blue-400 font-medium mr-2">{line.mpn}</span>
                )}
                <span className={line.icon === 'check' ? 'text-gray-200' : line.icon === 'miss' ? 'text-yellow-400' : 'text-gray-400'}>
                  {line.text}
                </span>
                {line.meta && <span className="text-gray-600 ml-2 text-xs">{line.meta}</span>}
                {line.source && <span className="ml-2">{srcBadge(line.source)}</span>}
                {line.classification === 'non-auxiliary' && (
                  <span className="ml-2 inline-block rounded border border-blue-700 bg-blue-950/40 px-1.5 py-0.5 text-[10px] text-blue-300">
                    fundamental
                  </span>
                )}
                {line.classification === 'auxiliary' && (
                  <span className="ml-2 inline-block rounded border border-gray-700 bg-gray-800/40 px-1.5 py-0.5 text-[10px] text-gray-400">
                    support
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {error && (
          <div className="text-red-400 text-xs mt-2 border border-red-800 rounded px-3 py-2 bg-red-950/40">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Progress bar */}
      {total > 0 && !done && (
        <div className="shrink-0 px-6 pb-4">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500"
              animate={{ width: `${(lines.filter(l => l.mpn).length / total) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase 2: Unified Selection (multi_match + web_found + not_found) ──────────

function SelectionPhase({ parts, needsAction, onComplete }: {
  parts: PartDetail[];
  needsAction: PartEnrichmentResult[];
  onComplete: (parts: PartDetail[]) => void;
}) {
  const { sessionId } = useSession();

  // multi_match: pick from Nexar candidates
  const multiMatch = needsAction.filter(a => a.status === 'multi_match');
  // web_found: confirm web reference / datasheet
  const webFound = needsAction.filter(a => a.status === 'web_found');
  // not_found: fill in manually
  const notFound = needsAction.filter(a => a.status === 'not_found');

  const total = multiMatch.length + webFound.length + notFound.length;

  // multi_match state: {mpn → selected index}
  const [multiSel, setMultiSel] = useState<Record<string, number>>(() =>
    Object.fromEntries(multiMatch.map(a => [a.mpn, 0]))
  );

  // web_found state: {mpn → {confirmed, skipped}}
  const [webSel, setWebSel] = useState<Record<string, { confirmed: boolean; skipped: boolean }>>(() =>
    Object.fromEntries(webFound.map(a => [a.mpn, { confirmed: false, skipped: false }]))
  );

  // not_found state: {mpn → custom form fields}
  interface CustomFields { description: string; manufacturer: string; category: string; datasheet_url: string; extraFields: Record<string, string>; suggestedFields: string[]; loadingFields: boolean; }
  const [customForms, setCustomForms] = useState<Record<string, CustomFields>>(() =>
    Object.fromEntries(notFound.map(a => [a.mpn, {
      description: '', manufacturer: '', category: '', datasheet_url: '',
      extraFields: {}, suggestedFields: [], loadingFields: false,
    }]))
  );

  const [saving, setSaving] = useState(false);

  const loadSuggestedFields = async (mpn: string) => {
    if (!sessionId) return;
    setCustomForms(prev => ({ ...prev, [mpn]: { ...prev[mpn], loadingFields: true } }));
    const form = customForms[mpn];
    const fields = await suggestPartFields(sessionId, mpn, form.description || null, form.category || null);
    setCustomForms(prev => ({
      ...prev,
      [mpn]: { ...prev[mpn], loadingFields: false, suggestedFields: fields, extraFields: Object.fromEntries(fields.map(f => [f, ''])) }
    }));
  };

  const handleConfirm = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      // 1. Save multi_match selections
      for (const a of multiMatch) {
        const candidates = a.candidates ?? [];
        const idx = multiSel[a.mpn] ?? 0;
        if (candidates[idx]) {
          await selectPartMatch(sessionId, a.mpn, candidates[idx]);
        }
      }
      // 2. Save web_found confirmations
      for (const a of webFound) {
        const sel = webSel[a.mpn];
        if (sel?.confirmed) {
          await confirmWebPart(sessionId, a.mpn, a.product_url ?? null, a.datasheet_url ?? null, a.description ?? null, null);
        }
      }
      // 3. Save custom parts
      for (const a of notFound) {
        const form = customForms[a.mpn];
        const hasAny = form.description || form.manufacturer || form.category || Object.values(form.extraFields).some(Boolean);
        if (hasAny) {
          await saveCustomPart(sessionId, a.mpn, {
            manufacturer: form.manufacturer || undefined,
            description: form.description || undefined,
            category: form.category || undefined,
            datasheet_url: form.datasheet_url || undefined,
            specs: Object.fromEntries(Object.entries(form.extraFields).filter(([, v]) => v)),
          });
        }
      }
      onComplete(parts);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (total === 0) {
    onComplete(parts);
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="shrink-0 px-8 py-5 bg-white border-b">
        <h2 className="text-lg font-semibold text-gray-900">Part Confirmation Required</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {total} part{total !== 1 ? 's' : ''} need your input before classification can continue.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* ── Multi-match: pick from Nexar candidates ── */}
        {multiMatch.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-yellow-100 text-yellow-700 text-xs flex items-center justify-center font-bold">{multiMatch.length}</span>
              Multiple Nexar matches — pick the correct one
            </h3>
            <div className="space-y-4">
              {multiMatch.map(a => (
                <div key={a.mpn} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono font-bold text-gray-900">{a.mpn}</span>
                    {a.description && <span className="text-xs text-gray-400 truncate">{a.description}</span>}
                  </div>
                  <div className="grid gap-2">
                    {(a.candidates ?? []).map((c, i) => (
                      <button
                        key={c.mpn}
                        onClick={() => setMultiSel(prev => ({ ...prev, [a.mpn]: i }))}
                        className={`text-left rounded-lg border p-3 transition-all ${
                          multiSel[a.mpn] === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-sm font-semibold text-gray-900">{c.mpn}</div>
                            {c.category && <div className="text-xs text-gray-600 mt-0.5">{c.category}</div>}
                            {c.description && <div className="text-xs text-gray-400 truncate">{c.description}</div>}
                            {c.manufacturer && <div className="text-xs text-gray-500 mt-1">{c.manufacturer}</div>}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {c.is_exact_match && <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">exact</span>}
                            {c.datasheet_url && (
                              <a href={c.datasheet_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                 className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                                <ExternalLink className="h-3 w-3" /> datasheet
                              </a>
                            )}
                            {multiSel[a.mpn] === i && <CheckCircle className="h-4 w-4 text-blue-500" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Web-found: confirm reference ── */}
        {webFound.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">{webFound.length}</span>
              Found via web — confirm reference
            </h3>
            <div className="space-y-3">
              {webFound.map(a => (
                <div key={a.mpn} className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                  webSel[a.mpn]?.confirmed ? 'border-green-300' : webSel[a.mpn]?.skipped ? 'border-gray-200 opacity-60' : 'border-purple-200'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900">{a.mpn}</span>
                        {srcBadge(a.source)}
                        <span className="text-xs text-gray-400">conf: {parseFloat(a.confidence ?? '0').toFixed(2)}</span>
                      </div>
                      {a.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {a.datasheet_url && (
                          <a href={a.datasheet_url} target="_blank" rel="noopener noreferrer"
                             className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            <ExternalLink className="h-3 w-3" /> Datasheet
                          </a>
                        )}
                        {a.product_url && (
                          <a href={a.product_url} target="_blank" rel="noopener noreferrer"
                             className="text-xs text-gray-600 hover:underline flex items-center gap-0.5 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                            <ExternalLink className="h-3 w-3" /> Product page
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => setWebSel(prev => ({ ...prev, [a.mpn]: { confirmed: true, skipped: false } }))}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          webSel[a.mpn]?.confirmed ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                        }`}
                      >
                        {webSel[a.mpn]?.confirmed ? '✓ Confirmed' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setWebSel(prev => ({ ...prev, [a.mpn]: { confirmed: false, skipped: true } }))}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          webSel[a.mpn]?.skipped ? 'bg-gray-400 text-white' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Not-found: manual entry ── */}
        {notFound.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-red-100 text-red-700 text-xs flex items-center justify-center font-bold">{notFound.length}</span>
              Not found — enter specs manually (or skip)
            </h3>
            <div className="space-y-4">
              {notFound.map(a => {
                const form = customForms[a.mpn];
                return (
                  <div key={a.mpn} className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono font-bold text-gray-900">{a.mpn}</span>
                      <span className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">not found</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {(['description', 'manufacturer', 'category', 'datasheet_url'] as const).map(field => (
                        <div key={field} className={field === 'description' ? 'col-span-2' : ''}>
                          <label className="text-[11px] text-gray-500 mb-0.5 block capitalize">{field.replace('_', ' ')}</label>
                          <input
                            type="text"
                            value={form[field]}
                            onChange={e => setCustomForms(prev => ({ ...prev, [a.mpn]: { ...prev[a.mpn], [field]: e.target.value } }))}
                            placeholder={field === 'datasheet_url' ? 'https://…' : `Enter ${field}`}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                    {/* Extra spec fields */}
                    {form.suggestedFields.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {form.suggestedFields.map(f => (
                          <div key={f}>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">{f.replace(/_/g, ' ')}</label>
                            <input
                              type="text"
                              value={form.extraFields[f] ?? ''}
                              onChange={e => setCustomForms(prev => ({ ...prev, [a.mpn]: { ...prev[a.mpn], extraFields: { ...prev[a.mpn].extraFields, [f]: e.target.value } } }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => loadSuggestedFields(a.mpn)}
                      disabled={form.loadingFields}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {form.loadingFields ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                      {form.suggestedFields.length > 0 ? 'Refresh AI suggestions' : 'Ask AI for spec fields'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="shrink-0 px-8 py-4 border-t bg-white">
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><CheckCircle className="h-4 w-4" /> Confirm &amp; Continue</>}
        </button>
      </div>
    </div>
  );
}

// ── Phase 3: Classify (fundamental / auxiliary) ────────────────────────────────

function ClassifyPhase({ initialParts, onComplete }: {
  initialParts: PartDetail[];
  onComplete: (components: Component[]) => void;
}) {
  const { sessionId, setCurrentStage } = useSession();

  const toComponent = (p: PartDetail, index: number): Component => ({
    id: `comp-${p.part_number}-${index}`,
    reference: p.part_number,
    partNumber: p.part_number,
    manufacturer: p.manufacturer ?? undefined,
    description: p.description || p.part_number,
    type: p.category || 'IC',
    isFundamental: p.classification == null ? undefined : p.classification === 'non-auxiliary',
    isIdentified: p.confidence >= 0.8,
    isGeneric: false,
    complianceStatus: 'unknown' as const,
    specs: {
      category: p.category,
      source: p.source,
      confidence: p.confidence,
      needs_review: p.needs_review,
      datasheet_url: p.datasheet_url,
      candidates: p.candidates,
    },
  });

  const [localComponents, setLocalComponents] = useState<Component[]>(() =>
    initialParts.map(toComponent)
  );
  const [partDetailMap, setPartDetailMap] = useState<Record<string, PartDetail>>(() => {
    const m: Record<string, PartDetail> = {};
    initialParts.forEach(p => { m[p.part_number] = p; });
    return m;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [showContextInput, setShowContextInput] = useState(false);
  const [contextHint, setContextHint] = useState('');
  const [modelDrawerMpn, setModelDrawerMpn] = useState<string | null>(null);
  const originalRef = useRef<Record<string, 'auxiliary' | 'non-auxiliary' | null>>({});

  // ── Enrichment state (added during consolidation 2026-06-10) ────────────
  // Once classifications are confirmed, we kick off enrichment on the
  // fundamental parts and poll for status. The per-row status overlay shows
  // a spinner / green / red icon. The Continue button stays disabled until
  // enrichment is complete (or every failed part is acknowledged via modal).
  const [enrichmentStarted, setEnrichmentStarted] = useState(false);
  const [enrichmentByMpn, setEnrichmentByMpn] = useState<Map<string, PartEnrichmentDetail>>(new Map());
  const [enrichmentComplete, setEnrichmentComplete] = useState(false);
  const [errorModalMpn, setErrorModalMpn] = useState<string | null>(null);
  const [skippedMpns, setSkippedMpns] = useState<Set<string>>(new Set());
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    initialParts.forEach(p => {
      originalRef.current[p.part_number] = p.classification ?? null;
    });
  }, []);

  // Poll enrichment status every 3s while it's running. Stops when complete.
  useEffect(() => {
    if (!sessionId || !enrichmentStarted || enrichmentComplete) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getModelEnrichmentStatus(sessionId);
        if (cancelled) return;
        // Only setState when something actually changed — otherwise we trigger
        // a full re-render every 3 seconds, which unmounts/remounts the part
        // cards and causes the page to "blink". Hashing by mpn+status keeps
        // the comparison cheap and avoids the noop renders.
        setEnrichmentByMpn(prev => {
          let changed = prev.size !== status.parts.length;
          if (!changed) {
            for (const p of status.parts) {
              const old = prev.get(p.mpn);
              if (!old || old.status !== p.status || old.failure_reason !== p.failure_reason) {
                changed = true;
                break;
              }
            }
          }
          if (!changed) return prev;
          const next = new Map<string, PartEnrichmentDetail>();
          for (const p of status.parts) next.set(p.mpn, p);
          return next;
        });
        if (status.complete || status.extracting === 0) {
          setEnrichmentComplete(true);
        }
      } catch (err) {
        console.error('[enrichment] poll failed', err);
      }
    };
    void poll();
    pollTimerRef.current = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [sessionId, enrichmentStarted, enrichmentComplete]);

  /**
   * Per-part enrichment status used by PartCard. Returns:
   *  - 'pending'    — enrichment hasn't started yet OR this part hasn't been queued
   *  - 'extracting' — enrichment is in progress for this part
   *  - 'done'       — part_model successfully extracted
   *  - 'failed'     — extraction error; user needs to act
   *  - 'no_datasheet' — no datasheet URL available; user can supply one
   *  - 'skipped'    — user explicitly chose to skip this part
   */
  const enrichmentStatusFor = (mpn: string): PartEnrichmentState | 'pending' | 'skipped' => {
    if (skippedMpns.has(mpn)) return 'skipped';
    if (!enrichmentStarted) return 'pending';
    const detail = enrichmentByMpn.get(mpn);
    return detail?.status ?? 'pending';
  };

  // True when every fundamental part has reached a terminal state (done,
  // failed-and-skipped, or no_datasheet-and-skipped). Enables the Continue button.
  const allFundamentalsReady = (() => {
    if (!enrichmentStarted) return false;
    const fundamentals = localComponents.filter(c => c.isFundamental === true);
    if (fundamentals.length === 0) return false;
    return fundamentals.every(c => {
      const mpn = c.partNumber;
      if (!mpn) return true;
      const status = enrichmentStatusFor(mpn);
      return status === 'done' || status === 'skipped';
    });
  })();

  const fundamentalComponents = localComponents.filter(c => c.isFundamental === true);
  const auxiliaryComponents = localComponents.filter(c => c.isFundamental === false);
  const unclassified = localComponents.filter(c => c.isFundamental === undefined);

  const filterComps = (comps: Component[]) => {
    if (!searchQuery.trim()) return comps;
    const q = searchQuery.toLowerCase();
    return comps.filter(c =>
      (c.partNumber || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q)
    );
  };

  // useCallback so the memoized PartCard sees a stable identity across renders.
  const handleMove = useCallback((id: string, isFundamental: boolean) => {
    setLocalComponents(prev => prev.map(c => c.id === id ? { ...c, isFundamental } : c));
  }, []);

  const handleOpenErrorModal = useCallback((mpn: string) => {
    setErrorModalMpn(mpn);
  }, []);

  const getPendingChanges = () =>
    localComponents.flatMap(c => {
      if (!c.partNumber) return [];
      const orig = originalRef.current[c.partNumber];
      const curr: 'auxiliary' | 'non-auxiliary' | null = c.isFundamental === true ? 'non-auxiliary' : c.isFundamental === false ? 'auxiliary' : null;
      if (curr !== null && curr !== orig) return [{ mpn: c.partNumber, new_classification: curr }];
      return [];
    });

  /**
   * Confirm classifications + start enrichment. Rewired during the
   * consolidation (2026-06-10): we no longer hand off to a separate page;
   * the same screen shows per-part enrichment status, and Continue takes
   * the user straight to /requirements (via the parent's onComplete flow).
   *
   * Flow:
   *   1. Persist any pending classification changes (PUT /classification/bulk)
   *   2. POST /pipeline/enrich to start enrichment on fundamentals
   *   3. Switch UI into "enriching" mode — per-part icons start polling
   *   4. Continue button shows up below; enabled when allFundamentalsReady
   */
  const handleApply = async () => {
    if (!sessionId) return;
    const changes = getPendingChanges();
    setIsApplying(true);
    try {
      if (changes.length > 0) {
        await bulkUpdateClassification(sessionId, changes, setCurrentStage);
        changes.forEach(ch => { originalRef.current[ch.mpn] = ch.new_classification; });
      }
      // Kick off enrichment. The endpoint queues per-part Docling+Claude
      // jobs and is safe to call again if already running.
      await triggerModelEnrichment(sessionId);
      setEnrichmentStarted(true);
      toast.success(
        changes.length > 0
          ? `Applied ${changes.length} change${changes.length !== 1 ? 's' : ''} — extracting datasheets`
          : 'Extracting datasheets…',
      );
    } catch (e: any) {
      console.error('[classify] Apply + enrich failed', e);
      toast.error(e?.message || 'Failed to start enrichment');
    } finally {
      setIsApplying(false);
    }
  };

  const handleContinue = () => {
    onComplete(localComponents);
  };

  // Per-part error/retry handlers — used by the modal.
  const handleSkipPart = (mpn: string) => {
    setSkippedMpns(prev => new Set(prev).add(mpn));
    setErrorModalMpn(null);
    toast.message(`${mpn} skipped — you can enrich it later from /enrichment`);
  };

  const handleRetryPart = async (mpn: string, newDatasheetUrl?: string) => {
    if (!sessionId) return;
    try {
      if (newDatasheetUrl?.trim()) {
        await updatePartDatasheetUrl(sessionId, mpn, newDatasheetUrl.trim());
      } else {
        // Without a new URL, re-trigger enrichment will retry this part.
        await triggerModelEnrichment(sessionId);
      }
      // Force polling to resume by clearing the complete flag.
      setEnrichmentComplete(false);
      setErrorModalMpn(null);
      toast.success(`${mpn} queued for re-enrichment`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to retry');
    }
  };

  const handleReclassify = async () => {
    if (!sessionId) return;
    setIsReclassifying(true);
    setShowContextInput(false);
    try {
      await classifyPartsStream(
        sessionId,
        (event) => {
          if (event.type === 'error') {
            toast.error(String(event.message ?? 'Classification failed'));
          } else if (event.type === 'complete') {
            const result = event.result as { parts: PartDetail[] };
            const parts = result?.parts ?? [];
            const newMap: Record<string, PartDetail> = {};
            parts.forEach(p => { newMap[p.part_number] = p; });
            setPartDetailMap(newMap);
            setLocalComponents(parts.map(toComponent));
            parts.forEach(p => { originalRef.current[p.part_number] = p.classification ?? null; });
            toast.success('Re-classification complete');
          }
        },
        { contextHint },
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsReclassifying(false);
    }
  };

  const pending = getPendingChanges();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 bg-white border-b flex items-center gap-4">
        <div className="flex gap-4 text-sm">
          <span className="text-blue-600 font-semibold">{fundamentalComponents.length} fundamental</span>
          <span className="text-gray-500">{auxiliaryComponents.length} auxiliary</span>
          {unclassified.length > 0 && <span className="text-yellow-600">{unclassified.length} unclassified</span>}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={enrichmentStarted}
            placeholder={enrichmentStarted ? 'Locked during enrichment' : 'Search parts…'}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {searchQuery && !enrichmentStarted && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-gray-400" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowContextInput(v => !v)}
          disabled={isReclassifying || enrichmentStarted}
          title={enrichmentStarted ? 'Locked during enrichment' : undefined}
          className="shrink-0 flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isReclassifying
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Classifying…</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Re-classify</>}
        </button>
      </div>

      {/* Re-classify context panel */}
      <AnimatePresence>
        {showContextInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b bg-blue-50"
          >
            <div className="px-6 py-3 flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />
              <input
                type="text"
                value={contextHint}
                onChange={e => setContextHint(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !enrichmentStarted && handleReclassify()}
                disabled={enrichmentStarted}
                placeholder="Optional: describe the system to guide classification (e.g. 'autonomous robot for warehouse logistics')"
                className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-100"
                autoFocus
              />
              <button
                onClick={handleReclassify}
                disabled={enrichmentStarted}
                className="shrink-0 text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run
              </button>
              <button onClick={() => setShowContextInput(false)} className="shrink-0 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unclassified queue */}
      {unclassified.length > 0 && (
        <div className="shrink-0 border-b bg-yellow-50 px-4 py-3">
          <p className="text-xs font-semibold text-yellow-700 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Unclassified — assign each part ({unclassified.length} remaining)
          </p>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {filterComps(unclassified).map(comp => {
              const detail = comp.partNumber ? partDetailMap[comp.partNumber] : null;
              return (
                <div key={comp.id} className="bg-white border border-yellow-200 rounded-lg px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-gray-900">{comp.partNumber}</span>
                      {detail && srcBadge(detail.source)}
                    </div>
                    {detail?.category && <div className="text-[11px] text-gray-500 truncate">{detail.category}</div>}
                    {detail?.description && detail.description !== comp.partNumber && (
                      <div className="text-[11px] text-gray-400 truncate">{detail.description}</div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleMove(comp.id, true)}
                      disabled={enrichmentStarted}
                      className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-md hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Non-Aux
                    </button>
                    <button
                      onClick={() => handleMove(comp.id, false)}
                      disabled={enrichmentStarted}
                      className="text-xs bg-gray-600 text-white px-2.5 py-1 rounded-md hover:bg-gray-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Auxiliary
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two-pane */}
      <div className="flex-1 overflow-hidden flex gap-0">
        {/* Fundamental */}
        <div className="flex-1 flex flex-col border-r overflow-hidden">
          <div className="shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-sm text-blue-900">Non-Auxiliary</span>
            <span className="ml-auto text-blue-600 font-bold text-sm">{fundamentalComponents.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filterComps(fundamentalComponents).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                <Cpu className="h-8 w-8 mb-2 text-gray-300" />
                Assign parts above
              </div>
            ) : (
              filterComps(fundamentalComponents).map(comp => {
                const mpn = comp.partNumber || '';
                const detail = mpn ? (partDetailMap[mpn] ?? null) : null;
                const enrichStatus = mpn ? enrichmentStatusFor(mpn) : 'pending';
                return (
                  <PartCard
                    key={comp.id}
                    comp={comp}
                    side="fund"
                    detail={detail}
                    enrichStatus={enrichStatus}
                    enrichmentStarted={enrichmentStarted}
                    lockMoves={enrichmentStarted && !enrichmentComplete}
                    onMove={handleMove}
                    onOpenErrorModal={handleOpenErrorModal}
                    onOpenModel={mpn ? () => setModelDrawerMpn(mpn) : undefined}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Auxiliary */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 py-2 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
            <Zap className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-700">Auxiliary</span>
            <span className="ml-auto text-gray-600 font-bold text-sm">{auxiliaryComponents.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filterComps(auxiliaryComponents).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                <Zap className="h-8 w-8 mb-2 text-gray-300" />
                Assign parts above
              </div>
            ) : (
              filterComps(auxiliaryComponents).map(comp => {
                const mpn = comp.partNumber || '';
                const detail = mpn ? (partDetailMap[mpn] ?? null) : null;
                const enrichStatus = mpn ? enrichmentStatusFor(mpn) : 'pending';
                return (
                  <PartCard
                    key={comp.id}
                    comp={comp}
                    side="aux"
                    detail={detail}
                    enrichStatus={enrichStatus}
                    enrichmentStarted={enrichmentStarted}
                    lockMoves={enrichmentStarted && !enrichmentComplete}
                    onMove={handleMove}
                    onOpenErrorModal={handleOpenErrorModal}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-3 border-t bg-white">
        {(() => {
          // After enrichment is kicked off the footer becomes a progress
          // indicator + Continue button. Reset/Apply buttons hide because
          // classification is locked while enrichment is in flight.
          if (enrichmentStarted) {
            const fundamentals = localComponents.filter(c => c.isFundamental === true);
            const done = fundamentals.filter(c => {
              const status = c.partNumber ? enrichmentStatusFor(c.partNumber) : 'pending';
              return status === 'done' || status === 'skipped';
            }).length;
            const failed = fundamentals.filter(c => {
              const status = c.partNumber ? enrichmentStatusFor(c.partNumber) : 'pending';
              return status === 'failed' || status === 'no_datasheet';
            }).length;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Enriching {done}/{fundamentals.length}
                    {failed > 0 && ` · ${failed} need attention`}
                  </span>
                  {!allFundamentalsReady && (
                    <span className="text-gray-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      polling…
                    </span>
                  )}
                </div>
                <button
                  onClick={handleContinue}
                  disabled={!allFundamentalsReady}
                  className={`w-full rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 ${
                    allFundamentalsReady
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Continue to Design <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          }
          // Pre-enrichment footer (original flow).
          if (unclassified.length > 0) {
            return (
              <button disabled className="w-full rounded-lg bg-gray-200 py-2 text-gray-500 text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Classify {unclassified.length} remaining part{unclassified.length !== 1 ? 's' : ''} first
              </button>
            );
          }
          if (pending.length > 0) {
            return (
              <div className="flex gap-3">
                <button
                  onClick={() => setLocalComponents(prev => prev.map(c => {
                    const orig = c.partNumber ? originalRef.current[c.partNumber] : null;
                    return { ...c, isFundamental: orig === null ? undefined : orig === 'non-auxiliary' };
                  }))}
                  disabled={isApplying}
                  className="flex-1 rounded-lg bg-gray-100 py-2 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="flex-2 flex-[2] rounded-lg bg-blue-600 py-2 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isApplying ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</> : <><CheckCircle className="h-4 w-4" /> Apply {pending.length} change{pending.length !== 1 ? 's' : ''} & Enrich</>}
                </button>
              </div>
            );
          }
          // No pending changes — apply (no-op) + enrich
          return (
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="w-full rounded-lg bg-green-600 py-2 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isApplying ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Confirm & Enrich <ArrowRight className="h-4 w-4" /></>}
            </button>
          );
        })()}
      </div>

      {/* Part model drawer — mounted outside the scroll containers */}
      {sessionId && (
        <PartModelDrawer
          mpn={modelDrawerMpn ?? ''}
          designId={sessionId}
          isOpen={modelDrawerMpn !== null}
          onClose={() => setModelDrawerMpn(null)}
        />
      )}

      {/* Enrichment error modal — shown when user clicks a red/orange status icon */}
      {errorModalMpn && (() => {
        const detail = enrichmentByMpn.get(errorModalMpn);
        return (
          <EnrichmentErrorModal
            mpn={errorModalMpn}
            status={detail?.status ?? null}
            failureReason={detail?.failure_reason ?? null}
            datasheetUrl={detail?.datasheet_url ?? null}
            onClose={() => setErrorModalMpn(null)}
            onRetry={(url) => handleRetryPart(errorModalMpn, url)}
            onSkip={() => handleSkipPart(errorModalMpn)}
          />
        );
      })()}
    </div>
  );
}

// ── Enrichment error modal ──────────────────────────────────────────────────

interface EnrichmentErrorModalProps {
  mpn: string;
  status: PartEnrichmentState | null;
  failureReason: string | null;
  datasheetUrl: string | null;
  onClose: () => void;
  onRetry: (newDatasheetUrl?: string) => void;
  onSkip: () => void;
}

function EnrichmentErrorModal({ mpn, status, failureReason, datasheetUrl, onClose, onRetry, onSkip }: EnrichmentErrorModalProps) {
  const [url, setUrl] = useState(datasheetUrl ?? '');
  const isMissingDatasheet = status === 'no_datasheet';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-red-700">
              {isMissingDatasheet ? 'No datasheet' : 'Extraction failed'}
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-gray-900">{mpn}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {failureReason && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-[11px] text-red-800">
              {failureReason}
            </div>
          )}
          {isMissingDatasheet && (
            <div className="text-[11px] text-gray-600">
              No datasheet URL was found for this part. Paste one below and we'll retry.
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold uppercase text-gray-500">
              Datasheet URL (optional)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/datasheet.pdf"
              className="w-full h-9 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <p className="text-[10px] text-gray-400">
              Leave blank to just retry with the existing source.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200 p-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Skip this part
          </button>
          <button
            type="button"
            onClick={() => onRetry(url || undefined)}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FundamentalClassificationView({
  components: _components,
  onClassificationComplete,
  forceClassifyPhase = false,
}: FundamentalClassificationViewProps) {
  const { sessionId, refreshTrigger } = useSession();
  const [phase, setPhase] = useState<Phase>(forceClassifyPhase ? 'classify' : 'research');
  const [enrichedParts, setEnrichedParts] = useState<PartDetail[]>([]);
  const [pendingAction, setPendingAction] = useState<PartEnrichmentResult[]>([]);
  // When forceClassifyPhase, don't render ClassifyPhase until data is loaded
  const [loading, setLoading] = useState(forceClassifyPhase);

  // Load classification data on mount.
  // When forceClassifyPhase=true: load existing data. If all parts are unclassified,
  // auto-run the AI classification agent first (POST /classify), then reload.
  // When in normal mode, skip research if already classified.
  useEffect(() => {
    if (!sessionId) return;
    let isCurrent = true;

    const load = async () => {
      try {
        const result = await getClassification(sessionId);
        if (!isCurrent) return;
        if (result.parts?.length) {
          if (forceClassifyPhase) {
            const allNull = Object.values(result.classification_map).every(v => v === null);
            if (allNull) {
              // SSE stream — no artificial timeout, resolves when Gemini finishes
              let streamError: string | null = null;
              await classifyPartsStream(sessionId, (event) => {
                if (event.type === 'error') streamError = String(event.message ?? 'Classification failed');
              });
              if (streamError) throw new Error(streamError);
              if (!isCurrent) return;
              const refreshed = await getClassification(sessionId);
              if (!isCurrent) return;
              setEnrichedParts(refreshed.parts ?? []);
            } else {
              setEnrichedParts(result.parts);
            }
            setPhase('classify');
          } else {
            setEnrichedParts(result.parts);
            const allNull = Object.values(result.classification_map).every(v => v === null);
            if (!allNull) setPhase('classify');
          }
        }
      } catch {
        // 404 or error — stay on current phase
      } finally {
        if (isCurrent && forceClassifyPhase) setLoading(false);
      }
    };

    load();
    return () => { isCurrent = false; };
  }, [sessionId, refreshTrigger, forceClassifyPhase]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">No session. Please upload a BOM first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 font-medium">Classifying parts…</p>
          <p className="text-xs text-gray-400 mt-1">AI agent is assigning auxiliary / non-auxiliary based on the system</p>
        </div>
      </div>
    );
  }

  if (phase === 'research') {
    return (
      <ResearchPhase
        sessionId={sessionId}
        onComplete={(parts, needsAction) => {
          setEnrichedParts(parts);
          setPendingAction(needsAction);
          setPhase(needsAction.length > 0 ? 'selection' : 'classify');
        }}
      />
    );
  }

  if (phase === 'selection') {
    return (
      <SelectionPhase
        parts={enrichedParts}
        needsAction={pendingAction}
        onComplete={updated => {
          setEnrichedParts(updated);
          setPhase('classify');
        }}
      />
    );
  }

  return (
    <ClassifyPhase
      initialParts={enrichedParts}
      onComplete={onClassificationComplete}
    />
  );
}
