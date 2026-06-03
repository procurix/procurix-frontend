/**
 * Part Identification View
 *
 * Phase 1 — Research: streams identify-parts/stream, shows terminal-style log.
 * Phase 2 — Review: shows ALL parts (identified + needs-action) for explicit
 *            user approval before proceeding to System Identification.
 */

import { useState, useEffect, useRef } from 'react';
import type { DesignPart, PartCandidate, PartIdentificationResolution, PartSpecEvidence, WebCandidate } from '@/app/services/api';
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  ExternalLink,
  AlertCircle,
  ArrowRight,
  Upload,
  X,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import {
  identifyPartsStream,
  confirmPartIdentificationReview,
  saveCustomPart,
  suggestPartFields,
  nexarRefreshPart,
  getParts,
  getPartSpecs,
  getCurrentStage,
} from '@/app/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StreamLine {
  id: string;
  mpn?: string;
  icon: 'spin' | 'check' | 'miss' | 'web';
  text: string;
  meta?: string;
  source?: string;
}

/** A part that was cleanly identified (exact_match or cache hit). */
interface IdentifiedPart {
  mpn: string;
  status: 'exact_match';
  category?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  datasheet_url?: string | null;
  product_url?: string | null;
  part_function?: string | null;
  topology_family?: string | null;
  source?: string;
  confidence?: string;
  candidates?: PartCandidate[];
  impact_level?: 'low' | 'high';
  params?: Record<string, string>;
}

/** A part that needs user action (web_found / not_found). */
interface ActionPart {
  mpn: string;
  status: 'web_found' | 'not_found';
  description?: string | null;
  source?: string;
  webCandidates?: WebCandidate[];
}

type WebSelection =
  | { kind: 'pending' }
  | { kind: 'candidate'; index: number }
  | { kind: 'manual' };

const PENDING_WEB_SELECTION: WebSelection = { kind: 'pending' };

export interface PartIdentificationViewProps {
  onComplete: () => void;
}

const IDENTIFIED_REVIEW_STATUSES = new Set([
  'identified',
  'web_confirmed',
  'custom',
  'user_provided',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : undefined;
}

function formatSpecValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(formatSpecValue).filter(Boolean);
    return values.length ? values.join(', ') : undefined;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, spec]) => {
        const formatted = formatSpecValue(spec);
        return formatted ? `${key}: ${formatted}` : undefined;
      })
      .filter(Boolean);
    return entries.length ? entries.join('; ') : undefined;
  }
  return undefined;
}

function normalizeParams(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const params = Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, spec]) => {
    const formatted = formatSpecValue(spec);
    if (formatted) acc[key] = formatted;
    return acc;
  }, {});

  return Object.keys(params).length ? params : undefined;
}

function humanizeSpecKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function technicalSpecEntries(part: IdentifiedPart): Array<{ key: string; label: string; value: string }> {
  return Object.entries(part.params ?? {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      key,
      label: humanizeSpecKey(key),
      value,
    }));
}

function sourceForSavedPart(status: string, spec?: PartSpecEvidence): string {
  const source = asString(spec?.source);
  if (source) return source;
  if (status === 'identified') return 'catalog';
  return status;
}

function savedPartKey(part: DesignPart): string | null {
  return part.selected_mpn || part.mpn;
}

function buildSavedReviewState(parts: DesignPart[], specsByMpn: Record<string, PartSpecEvidence> = {}): {
  hasSavedIdentification: boolean;
  identified: IdentifiedPart[];
  needsAction: ActionPart[];
} {
  const identifiedByMpn = new Map<string, IdentifiedPart>();
  const actionByMpn = new Map<string, ActionPart>();

  for (const part of parts) {
    const mpn = savedPartKey(part);
    if (!mpn) continue;

    const status = part.identification_status;
    if (status === 'web_unresolved') {
      actionByMpn.set(mpn, {
        mpn,
        status: 'web_found',
        source: 'web',
        webCandidates: Array.isArray(part.suggestions_json)
          ? (part.suggestions_json as WebCandidate[])
          : [],
      });
      continue;
    }

    if (status === 'not_found') {
      actionByMpn.set(mpn, { mpn, status: 'not_found' });
      continue;
    }

    if (status && IDENTIFIED_REVIEW_STATUSES.has(status) && !identifiedByMpn.has(mpn)) {
      const spec = specsByMpn[mpn] || specsByMpn[part.mpn || ''] || specsByMpn[part.selected_mpn || ''];
      identifiedByMpn.set(mpn, {
        mpn,
        status: 'exact_match',
        category: asNullableString(spec?.Category) ?? part.category,
        manufacturer: asNullableString(spec?.manufacturer) ?? part.manufacturer,
        description: asNullableString(spec?.Description),
        datasheet_url: asNullableString(spec?.datasheet_url),
        product_url: asNullableString(spec?.product_url),
        part_function: asNullableString(spec?.part_function),
        topology_family: asNullableString(spec?.topology_family),
        params: normalizeParams(spec?.params),
        source: sourceForSavedPart(status, spec),
        confidence: typeof spec?.confidence === 'number' ? String(spec.confidence) : undefined,
      });
    }
  }

  return {
    hasSavedIdentification: identifiedByMpn.size > 0 || actionByMpn.size > 0,
    identified: [...identifiedByMpn.values()],
    needsAction: [...actionByMpn.values()],
  };
}

async function loadSavedReviewState(sessionId: string): Promise<{
  hasSavedIdentification: boolean;
  identified: IdentifiedPart[];
  needsAction: ActionPart[];
}> {
  const [parts, specs] = await Promise.all([
    getParts(sessionId),
    getPartSpecs(sessionId).catch(() => ({} as Record<string, PartSpecEvidence>)),
  ]);
  return buildSavedReviewState(parts, specs);
}

function srcBadge(source: string | undefined | null) {
  if (!source || source === 'unknown') return null;
  const styles: Record<string, string> = {
    nexar: 'bg-blue-50 text-blue-600 border-blue-200',
    nexar_confirmed: 'bg-green-50 text-green-600 border-green-200',
    cache: 'bg-gray-50 text-gray-500 border-gray-200',
    cache_hit: 'bg-gray-50 text-gray-500 border-gray-200',
    web: 'bg-purple-50 text-purple-600 border-purple-200',
    web_broad: 'bg-orange-50 text-orange-600 border-orange-200',
    web_confirmed: 'bg-teal-50 text-teal-600 border-teal-200',
    user_provided: 'bg-green-50 text-green-700 border-green-300',
    catalog: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  const label: Record<string, string> = {
    nexar: 'nexar', nexar_confirmed: 'confirmed',
    cache: 'cached', cache_hit: 'cached',
    web: 'web', web_broad: 'ai search', web_confirmed: 'web ✓', user_provided: 'manual',
  };
  label.catalog = 'catalog';
  const cls = styles[source] ?? styles.cache;
  return (
    <span className={`inline-block border text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {label[source] ?? source}
    </span>
  );
}

// ── Datasheet upload field ─────────────────────────────────────────────────────

function DatasheetUploadField({
  file,
  url,
  accentColor = 'blue',
  onFileChange,
  onUrlChange,
}: {
  file: File | null;
  url: string;
  accentColor?: 'blue' | 'purple';
  onFileChange: (f: File | null) => void;
  onUrlChange: (u: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ring = accentColor === 'purple' ? 'focus:ring-purple-400' : 'focus:ring-blue-400';
  const btnCls = accentColor === 'purple'
    ? 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
    : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100';

  return (
    <div className="col-span-2 space-y-2">
      <label className="text-[11px] text-gray-500 block">Datasheet</label>
      {/* URL row */}
      <input
        type="text"
        value={url}
        disabled={!!file}
        onChange={e => onUrlChange(e.target.value)}
        placeholder="https://…/datasheet.pdf"
        className={`w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 ${ring} disabled:bg-gray-50 disabled:text-gray-400`}
      />
      {/* Upload row */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0] ?? null;
            onFileChange(f);
            if (f) onUrlChange('');
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg font-medium transition-colors ${btnCls}`}
        >
          <Upload className="h-3 w-3" />
          {file ? 'Replace PDF' : 'Upload PDF'}
        </button>
        {file && (
          <div className="flex items-center gap-1 text-xs text-gray-700 min-w-0">
            <span className="truncate max-w-[160px]">{file.name}</span>
            <button
              type="button"
              onClick={() => { onFileChange(null); if (inputRef.current) inputRef.current.value = ''; }}
              className="text-gray-400 hover:text-red-500 shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase 1: Research terminal ─────────────────────────────────────────────────

function ResearchPhase({
  sessionId,
  onComplete,
  setCurrentStage,
}: {
  sessionId: string;
  onComplete: (identified: IdentifiedPart[], needsAction: ActionPart[]) => void;
  setCurrentStage: (s: number | null) => void;
}) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const identifiedRef = useRef<IdentifiedPart[]>([]);
  const needsActionRef = useRef<ActionPart[]>([]);
  const lastEventAtRef = useRef(Date.now());

  const push = (line: StreamLine) => setLines(prev => [...prev, line]);
  const replace = (id: string, update: Partial<StreamLine>) =>
    setLines(prev => prev.map(l => (l.id === id ? { ...l, ...update } : l)));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const staleTimer = window.setInterval(() => {
      if (!done && Date.now() - lastEventAtRef.current > 45_000) {
        setError('Part identification appears stalled. Check backend logs or retry failed parts.');
      }
    }, 10_000);

    identifyPartsStream(
      sessionId,
      (event) => {
        lastEventAtRef.current = Date.now();
        if (event.type === 'start') {
          setTotal(event.total);
          push({ id: 'start', icon: 'check', text: `Identifying ${event.total} distinct parts…` });
        } else if (event.type === 'searching') {
          push({ id: event.mpn, icon: 'spin', text: 'Looking up', mpn: event.mpn });
        } else if (event.type === 'found') {
          replace(event.mpn, {
            icon: 'check',
            text: event.category || 'identified',
            meta: event.category ?? undefined,
            source: event.source,
          });
          identifiedRef.current.push({
            mpn: event.mpn,
            status: 'exact_match',
            category: event.category,
            description: event.description,
            datasheet_url: event.datasheet_url,
            product_url: event.product_url,
            params: normalizeParams(event.params),
            source: event.source,
          });
        } else if (event.type === 'web_found') {
          replace(event.mpn, {
            icon: 'web',
            text: `${event.candidates.length} web candidate${event.candidates.length !== 1 ? 's' : ''} — confirm`,
            source: event.source,
          });
          needsActionRef.current.push({
            mpn: event.mpn,
            status: 'web_found',
            source: event.source,
            webCandidates: event.candidates,
          });
        } else if (event.type === 'not_found') {
          replace(event.mpn, { icon: 'miss', text: 'not found — add manually' });
          needsActionRef.current.push({ mpn: event.mpn, status: 'not_found' });
        } else if (event.type === 'complete') {
          push({
            id: 'done',
            icon: 'check',
            text: `Done — ${event.identified}/${event.total} identified`,
          });
          setDone(true);
          window.clearInterval(staleTimer);
          if (event.status === 'failed') {
            setError('No parts were identified. Check the BOM column mapping and upload a corrected file.');
            return;
          }
          setTimeout(() => {
            void loadSavedReviewState(sessionId)
              .then(saved => {
                if (saved.hasSavedIdentification) {
                  onComplete(saved.identified, saved.needsAction);
                  return;
                }
                onComplete(identifiedRef.current, needsActionRef.current);
              })
              .catch(() => onComplete(identifiedRef.current, needsActionRef.current));
          }, 600);
        } else if (event.type === 'error') {
          window.clearInterval(staleTimer);
          setError(event.message);
        }
      },
      setCurrentStage,
    ).catch(e => {
      window.clearInterval(staleTimer);
      setError(String(e));
    });
    return () => window.clearInterval(staleTimer);
  // The stream is intentionally one-shot per mounted review session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconEl = (icon: StreamLine['icon']) => {
    if (icon === 'spin') return <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />;
    if (icon === 'check') return <span className="text-green-500 shrink-0 font-bold text-xs">✓</span>;
    if (icon === 'miss') return <span className="text-yellow-500 shrink-0 font-bold text-xs">?</span>;
    if (icon === 'web') return <span className="text-purple-400 shrink-0 font-bold text-xs">⌂</span>;
    return <span className="text-gray-400 shrink-0 text-xs">·</span>;
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 font-mono text-sm">
      <div className="shrink-0 px-6 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-gray-300 text-xs font-semibold tracking-wide">PART IDENTIFICATION</span>
        {total > 0 && (
          <span className="text-gray-500 text-xs">
            {Math.min(lines.filter(l => l.mpn).length, total)} / {total}
          </span>
        )}
      </div>

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
                <span className={
                  line.icon === 'check' ? 'text-gray-200'
                  : line.icon === 'miss' ? 'text-yellow-400'
                  : 'text-gray-400'
                }>
                  {line.text}
                </span>
                {line.meta && <span className="text-gray-600 ml-2 text-xs">{line.meta}</span>}
                {line.source && <span className="ml-2">{srcBadge(line.source)}</span>}
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

// ── Phase 2: Review — all parts, explicit approval ────────────────────────────

function ReviewPhase({
  identified,
  needsAction,
  onComplete,
}: {
  identified: IdentifiedPart[];
  needsAction: ActionPart[];
  onComplete: () => void;
}) {
  const { sessionId } = useSession();

  // ── Identified parts state (allow switching candidate) ──
  // expandedId: which identified part card is open
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // override: user chose a different candidate for an identified part
  const [identifiedOverrides, setIdentifiedOverrides] = useState<Record<string, number>>({});

  // ── Web-found state — track which candidate index was picked ──
  const [webSel, setWebSel] = useState<Record<string, WebSelection>>(() =>
    Object.fromEntries(
      needsAction.filter(a => a.status === 'web_found').map(a => [a.mpn, PENDING_WEB_SELECTION])
    )
  );

  // ── Custom entry forms — shared by not_found and skipped web_found ──
  interface CustomFields {
    description: string; manufacturer: string; category: string;
    datasheet_url: string; datasheetFile: File | null;
    extraFields: Record<string, string>;
    suggestedFields: string[]; loadingFields: boolean;
  }
  const emptyForm = (): CustomFields => ({
    description: '', manufacturer: '', category: '', datasheet_url: '',
    datasheetFile: null, extraFields: {}, suggestedFields: [], loadingFields: false,
  });
  const [customForms, setCustomForms] = useState<Record<string, CustomFields>>(() =>
    Object.fromEntries(needsAction.map(a => [a.mpn, emptyForm()]))
  );

  const [saving, setSaving] = useState(false);
  const [refreshingMpns, setRefreshingMpns] = useState<Set<string>>(new Set());
  const [refreshedParts, setRefreshedParts] = useState<Record<string, Partial<IdentifiedPart>>>({});

  const handleNexarRefresh = async (mpn: string) => {
    if (!sessionId) return;
    setRefreshingMpns(prev => new Set(prev).add(mpn));
    try {
      const updated = await nexarRefreshPart(sessionId, mpn);
      setRefreshedParts(prev => ({
        ...prev,
        [mpn]: {
          category: updated.category ?? undefined,
          description: updated.description ?? undefined,
          datasheet_url: updated.datasheet_url ?? undefined,
          source: updated.source,
          params: normalizeParams(updated.params),
        },
      }));
      // Clear any manual candidate override — fresh Nexar data supersedes it
      setIdentifiedOverrides(prev => { const n = { ...prev }; delete n[mpn]; return n; });
      if (updated.datasheet_url) {
        toast.success(`${mpn} refreshed — datasheet URL obtained`);
      } else {
        toast.info(`${mpn} refreshed from Nexar — no datasheet URL found, supply one at enrichment`);
      }
    } catch {
      toast.error(`Nexar lookup failed for ${mpn} — no update made`);
    } finally {
      setRefreshingMpns(prev => { const n = new Set(prev); n.delete(mpn); return n; });
    }
  };

  const webFound = needsAction.filter(a => a.status === 'web_found');
  const notFound = needsAction.filter(a => a.status === 'not_found');

  const webPending = webFound.filter(a => (webSel[a.mpn] ?? PENDING_WEB_SELECTION).kind === 'pending').length;
  const canProceed = webPending === 0;

  const loadSuggestedFields = async (mpn: string) => {
    if (!sessionId) return;
    setCustomForms(prev => ({ ...prev, [mpn]: { ...prev[mpn], loadingFields: true } }));
    const form = customForms[mpn];
    const fields = await suggestPartFields(sessionId, mpn, form.description || null, form.category || null);
    setCustomForms(prev => ({
      ...prev,
      [mpn]: {
        ...prev[mpn], loadingFields: false,
        suggestedFields: fields,
        extraFields: Object.fromEntries(fields.map(f => [f, ''])),
      },
    }));
  };

  const handleConfirm = async () => {
    if (!sessionId || !canProceed) return;
    setSaving(true);
    try {
      const resolutions: PartIdentificationResolution[] = [];
      const customParams = (form: CustomFields) =>
        Object.fromEntries(Object.entries(form.extraFields).filter(([, value]) => value));
      const hasCustomData = (form: CustomFields) => Boolean(
        form.description ||
        form.manufacturer ||
        form.category ||
        form.datasheet_url ||
        Object.values(form.extraFields).some(Boolean)
      );
      // Save identified-part overrides (if user picked a different candidate)
      for (const p of identified) {
        const overrideIdx = identifiedOverrides[p.mpn];
        if (overrideIdx !== undefined && overrideIdx !== 0 && p.candidates?.[overrideIdx]) {
          const candidate = p.candidates[overrideIdx];
          resolutions.push({
            original_mpn: p.mpn,
            action: 'select_match',
            selected_mpn: candidate.mpn,
            manufacturer: candidate.manufacturer ?? null,
            category: candidate.category ?? null,
            description: candidate.description ?? null,
            datasheet_url: candidate.datasheet_url ?? null,
            product_url: candidate.product_url ?? null,
            source: 'nexar',
          });
        }
      }
      // Save web-found confirmations — user picked a specific candidate index
      for (const a of webFound) {
        const sel = webSel[a.mpn];
        if (sel?.kind === 'candidate') {
          const cand = a.webCandidates?.[sel.index];
          if (cand) {
            resolutions.push({
              original_mpn: a.mpn,
              action: 'web_confirm',
              selected_mpn: cand.mpn || a.mpn,
              manufacturer: cand.manufacturer ?? null,
              category: cand.category ?? null,
              description: cand.description ?? null,
              datasheet_url: cand.datasheet_url ?? null,
              product_url: cand.product_url ?? null,
              source: cand.source ?? 'web',
            });
          }
        }
      }
      // Save custom parts — not_found and skipped web_found
      const partsForCustomSave = [
        ...notFound,
        ...webFound.filter(a => webSel[a.mpn]?.kind === 'manual'),
      ];
      for (const a of partsForCustomSave) {
        const form = customForms[a.mpn] ?? emptyForm();
        if (form.datasheetFile) {
          await saveCustomPart(sessionId, a.mpn, {
            manufacturer: form.manufacturer || undefined,
            description: form.description || undefined,
            category: form.category || undefined,
            datasheet_url: form.datasheet_url || undefined,
            specs: customParams(form),
            datasheetFile: form.datasheetFile,
          });
        } else if (hasCustomData(form)) {
          resolutions.push({
            original_mpn: a.mpn,
            action: 'custom',
            selected_mpn: a.mpn,
            manufacturer: form.manufacturer || null,
            description: form.description || null,
            category: form.category || null,
            datasheet_url: form.datasheet_url || null,
            params: customParams(form),
          });
        } else {
          resolutions.push({ original_mpn: a.mpn, action: 'skip' });
        }
      }
      const result = await confirmPartIdentificationReview(sessionId, resolutions);
      if (!result.success) {
        throw new Error(result.failures.map(f => `${f.mpn}: ${f.error}`).join('; ') || 'Part review could not be committed');
      }
      onComplete();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const totalParts = identified.length + needsAction.length;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* ── Header ── */}
      <div className="shrink-0 px-8 py-5 bg-white border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Part Identification Review</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Review all {totalParts} parts before proceeding to System Identification.
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
              {identified.length} identified
            </span>
            {needsAction.length > 0 && (
              <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">
                {needsAction.length} need review
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

        {/* ══ Section 1: Identified parts ══════════════════════════════════════ */}
        {identified.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Identified ({identified.length})
              <span className="text-xs text-gray-400 font-normal ml-1">
                — click to review or switch candidate
              </span>
            </h3>
            <div className="space-y-2">
              {identified.map(p => {
                const isOpen = expandedId === p.mpn;
                const selectedIdx = identifiedOverrides[p.mpn] ?? 0;
                const hasAlts = (p.candidates?.length ?? 0) > 1;
                // Merge any in-session Nexar refresh over the original stream data
                const ep = { ...p, ...(refreshedParts[p.mpn] ?? {}) };
                const specEntries = technicalSpecEntries(ep);

                return (
                  <div
                    key={p.mpn}
                    className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${
                      isOpen ? 'border-blue-300' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Summary row: expand toggle + optional Re-identify (siblings, not nested) */}
                    <div className="flex items-center">
                      <button
                        onClick={() => setExpandedId(isOpen ? null : p.mpn)}
                        className="flex-1 text-left px-4 py-3 flex items-center gap-3 min-w-0"
                      >
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{ep.mpn}</span>
                          {srcBadge(identifiedOverrides[p.mpn] !== undefined
                            ? (p.candidates?.[identifiedOverrides[p.mpn]]?.mpn ? 'nexar_confirmed' : ep.source)
                            : ep.source)}
                          {ep.category && (
                            <span className="text-xs text-gray-500">{ep.category}</span>
                          )}
                          {ep.description && ep.description !== ep.mpn && (
                            <span className="text-xs text-gray-400 truncate max-w-xs">{ep.description}</span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {hasAlts && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                              {p.candidates!.length} options
                            </span>
                          )}
                          {identifiedOverrides[p.mpn] !== undefined && (
                            <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                              changed
                            </span>
                          )}
                          {specEntries.length > 0 && (
                            <span className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                              {specEntries.length} specs
                            </span>
                          )}
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-gray-400" />
                            : <ChevronRight className="h-4 w-4 text-gray-400" />
                          }
                        </div>
                      </button>
                      {ep.source === 'cache_hit' && (
                        <div className="pr-3 shrink-0">
                          <button
                            onClick={() => void handleNexarRefresh(ep.mpn)}
                            disabled={refreshingMpns.has(ep.mpn)}
                            title="Re-fetch fresh data from Nexar"
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          >
                            <RefreshCw className={`h-3 w-3 ${refreshingMpns.has(ep.mpn) ? 'animate-spin' : ''}`} />
                            Re-identify
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded: show specs + candidates to pick */}
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                        {(ep.description || ep.manufacturer || ep.category || ep.part_function || ep.topology_family) && (
                          <div className="mb-3">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Part Details</div>
                            <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2">
                              {ep.description && (
                                <div className="text-xs text-gray-700">{ep.description}</div>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {ep.manufacturer && (
                                  <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600">
                                    {ep.manufacturer}
                                  </span>
                                )}
                                {ep.category && (
                                  <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600">
                                    {ep.category}
                                  </span>
                                )}
                                {ep.part_function && (
                                  <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                    {ep.part_function}
                                  </span>
                                )}
                                {ep.topology_family && (
                                  <span className="rounded border border-purple-100 bg-purple-50 px-2 py-0.5 text-[11px] text-purple-700">
                                    {ep.topology_family}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
                              Technical Specs From Identification
                            </div>
                            {ep.source && (
                              <span className="text-[10px] text-gray-400">source: {ep.source}</span>
                            )}
                          </div>
                          {specEntries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                              {specEntries.map(({ key, label, value }) => (
                                <div key={key} className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 truncate">
                                    {label}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-semibold text-gray-800 break-words">
                                    {value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                              No structured technical specs were returned by identification for this part yet.
                            </div>
                          )}
                        </div>
                        {hasAlts ? (
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-500 mb-2">Select the correct match:</p>
                            {p.candidates!.map((c, i) => (
                              <button
                                key={`${c.mpn}-${i}`}
                                onClick={() => setIdentifiedOverrides(prev => ({ ...prev, [p.mpn]: i }))}
                                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                                  selectedIdx === i
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-mono text-xs font-semibold text-gray-900">{c.mpn}</div>
                                    {c.category && <div className="text-xs text-gray-500 mt-0.5">{c.category}</div>}
                                    {c.description && (
                                      <div className="text-xs text-gray-400 truncate">{c.description}</div>
                                    )}
                                    {c.manufacturer && (
                                      <div className="text-xs text-gray-400 mt-0.5">{c.manufacturer}</div>
                                    )}
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end gap-1">
                                    {c.is_exact_match && (
                                      <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                                        exact
                                      </span>
                                    )}
                                    {i === 0 && (
                                      <span className="text-[10px] text-blue-600">
                                        auto-selected
                                      </span>
                                    )}
                                    {selectedIdx === i && (
                                      <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
                                    )}
                                    {c.datasheet_url && (
                                      <a
                                        href={c.datasheet_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="text-[10px] text-blue-400 hover:underline"
                                      >
                                        datasheet
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                            {ep.datasheet_url ? (
                              <a href={ep.datasheet_url} target="_blank" rel="noopener noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-0.5">
                                <ExternalLink className="h-3 w-3" /> View datasheet
                              </a>
                            ) : ep.product_url ? (
                              <a href={ep.product_url} target="_blank" rel="noopener noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-0.5">
                                <ExternalLink className="h-3 w-3" /> View product page
                              </a>
                            ) : (
                              <span>Identified via {ep.source ?? 'catalog'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ══ Section 2: Web-found — pick a source or enter manually ════════════ */}
        {webFound.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="text-purple-500 font-bold text-base">⌂</span>
              Web sources found — select or enter manually ({webFound.length})
            </h3>
            <div className="space-y-4">
              {webFound.map(a => {
                const selection = webSel[a.mpn] ?? PENDING_WEB_SELECTION;
                const skipped = selection.kind === 'manual';
                const form = customForms[a.mpn];
                return (
                  <div key={a.mpn} className="bg-white border border-purple-200 rounded-xl p-4 shadow-sm">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900">{a.mpn}</span>
                        {srcBadge(a.source)}
                        <span className="text-xs text-gray-400">— not in Nexar</span>
                      </div>
                      <button
                        onClick={() => setWebSel(prev => ({
                          ...prev,
                          [a.mpn]: skipped ? PENDING_WEB_SELECTION : { kind: 'manual' },
                        }))}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                          skipped
                            ? 'bg-gray-400 text-white'
                            : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {skipped ? 'Undo skip' : 'Enter manually'}
                      </button>
                    </div>

                    {/* Candidate list — hidden when manually entering */}
                    {!skipped && (
                      <div className="space-y-1.5">
                        {(a.webCandidates ?? []).map((c, i) => (
                          <button
                            key={`${c.mpn}-${i}`}
                            onClick={() => setWebSel(prev => ({ ...prev, [a.mpn]: { kind: 'candidate', index: i } }))}
                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                              selection.kind === 'candidate' && selection.index === i
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {c.description && (
                                  <div className="text-xs text-gray-800 font-medium line-clamp-2 mb-1">
                                    {c.description}
                                  </div>
                                )}
                                {(c.datasheet_url || c.product_url) && (
                                  <a
                                    href={(c.datasheet_url || c.product_url)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
                                  >
                                    <ExternalLink className="h-2.5 w-2.5" />
                                    {c.datasheet_url ? 'Datasheet PDF' : 'Product page'}
                                  </a>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-1">
                                <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                                  {Math.round(c.confidence * 100)}%
                                </span>
                                {selection.kind === 'candidate' && selection.index === i && <CheckCircle className="h-3.5 w-3.5 text-purple-500" />}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Inline manual form — shown when skipped */}
                    {skipped && (
                      <div className="mt-2 border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-500 mb-3">
                          Custom/classified — stays in your design only.
                        </p>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {(['description', 'manufacturer', 'category'] as const).map(field => (
                            <div key={field} className={field === 'description' ? 'col-span-2' : ''}>
                              <label className="text-[11px] text-gray-500 mb-0.5 block capitalize">{field}</label>
                              <input
                                type="text"
                                value={form[field]}
                                onChange={e => setCustomForms(prev => ({
                                  ...prev,
                                  [a.mpn]: { ...prev[a.mpn], [field]: e.target.value },
                                }))}
                                placeholder={`Enter ${field}`}
                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
                              />
                            </div>
                          ))}
                          <DatasheetUploadField
                            file={form.datasheetFile}
                            url={form.datasheet_url}
                            accentColor="purple"
                            onFileChange={f => setCustomForms(prev => ({
                              ...prev, [a.mpn]: { ...prev[a.mpn], datasheetFile: f, datasheet_url: '' },
                            }))}
                            onUrlChange={u => setCustomForms(prev => ({
                              ...prev, [a.mpn]: { ...prev[a.mpn], datasheet_url: u, datasheetFile: null },
                            }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ══ Section 4: Not found — manual entry (custom/classified) ══════════ */}
        {notFound.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              Not found — enter specs manually or skip ({notFound.length})
              <span className="text-xs text-gray-400 font-normal">Custom/classified parts stay in your design only</span>
            </h3>
            <div className="space-y-4">
              {notFound.map(a => {
                const form = customForms[a.mpn];
                return (
                  <div key={a.mpn} className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono font-bold text-gray-900">{a.mpn}</span>
                      <span className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        not found
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {(['description', 'manufacturer', 'category'] as const).map(field => (
                        <div key={field} className={field === 'description' ? 'col-span-2' : ''}>
                          <label className="text-[11px] text-gray-500 mb-0.5 block capitalize">{field}</label>
                          <input
                            type="text"
                            value={form[field]}
                            onChange={e =>
                              setCustomForms(prev => ({
                                ...prev,
                                [a.mpn]: { ...prev[a.mpn], [field]: e.target.value },
                              }))
                            }
                            placeholder={`Enter ${field}`}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      ))}
                      <DatasheetUploadField
                        file={form.datasheetFile}
                        url={form.datasheet_url}
                        accentColor="blue"
                        onFileChange={f => setCustomForms(prev => ({
                          ...prev, [a.mpn]: { ...prev[a.mpn], datasheetFile: f, datasheet_url: '' },
                        }))}
                        onUrlChange={u => setCustomForms(prev => ({
                          ...prev, [a.mpn]: { ...prev[a.mpn], datasheet_url: u, datasheetFile: null },
                        }))}
                      />
                    </div>
                    {form.suggestedFields.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {form.suggestedFields.map(f => (
                          <div key={f}>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">
                              {f.replace(/_/g, ' ')}
                            </label>
                            <input
                              type="text"
                              value={form.extraFields[f] ?? ''}
                              onChange={e =>
                                setCustomForms(prev => ({
                                  ...prev,
                                  [a.mpn]: {
                                    ...prev[a.mpn],
                                    extraFields: { ...prev[a.mpn].extraFields, [f]: e.target.value },
                                  },
                                }))
                              }
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
                      {form.loadingFields
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Search className="h-3 w-3" />}
                      {form.suggestedFields.length > 0 ? 'Refresh AI suggestions' : 'Ask AI for spec fields'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-8 py-4 border-t bg-white">
        {!canProceed && (
          <p className="text-xs text-yellow-600 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Confirm or skip all {webPending} web-found part{webPending !== 1 ? 's' : ''} to continue.
          </p>
        )}
        <button
          onClick={handleConfirm}
          disabled={saving || !canProceed}
          className="w-full rounded-xl bg-blue-600 py-3 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            <><CheckCircle className="h-4 w-4" /> Approve All &amp; Continue to System ID <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PartIdentificationView({ onComplete }: PartIdentificationViewProps) {
  const { sessionId, setCurrentStage } = useSession();
  const [phase, setPhase] = useState<'research' | 'review'>('research');
  const [identified, setIdentified] = useState<IdentifiedPart[]>([]);
  const [needsAction, setNeedsAction] = useState<ActionPart[]>([]);
  const [checkedSessionId, setCheckedSessionId] = useState<string | null>(null);
  const checkingCompletion = Boolean(sessionId && checkedSessionId !== sessionId);

  useEffect(() => {
    if (!sessionId) return;

    let isCurrent = true;

    getCurrentStage(sessionId)
      .then(async ({ current_stage }) => {
        if (!isCurrent) return;
        setCurrentStage(current_stage);
        const saved = await loadSavedReviewState(sessionId);
        if (!isCurrent) return;
        if (saved.hasSavedIdentification) {
          setIdentified(saved.identified);
          setNeedsAction(saved.needsAction);
          setPhase('review');
          setCheckedSessionId(sessionId);
          return;
        }
        if (current_stage >= 3) {
          onComplete();
          return;
        }
        setCheckedSessionId(sessionId);
      })
      .catch(() => {
        if (isCurrent) setCheckedSessionId(sessionId);
      });

    return () => {
      isCurrent = false;
    };
  }, [sessionId, setCurrentStage, onComplete]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">No session. Please upload a BOM first.</p>
      </div>
    );
  }

  if (checkingCompletion) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (phase === 'research') {
    return (
      <ResearchPhase
        sessionId={sessionId}
        setCurrentStage={setCurrentStage}
        onComplete={(id, action) => {
          setIdentified(id);
          setNeedsAction(action);
          setPhase('review');
        }}
      />
    );
  }

  return (
    <ReviewPhase
      identified={identified}
      needsAction={needsAction}
      onComplete={onComplete}
    />
  );
}
