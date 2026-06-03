import { useState, useEffect, useRef } from 'react';
import type { Component } from '@/app/types';
import {
  AlertCircle, Search, X, ExternalLink, ArrowRight,
  Zap, Cpu, ChevronDown, Package, Hash, Factory, Layers, DollarSign, Boxes,
  Loader2, PenLine,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import {
  confirmPartReview, getValidationResults, type ValidationResult,
  startEnrichFundamentals, getEnrichmentStatus, saveCustomPart, suggestPartFields,
} from '@/app/services/api';

interface ValidationViewProps {
  components: Component[];
  onValidationComplete: (validatedComponents: Component[]) => void;
}

// Expandable part card

function PartCard({ r, sessionId, onRefresh, enrichmentStatus }: {
  r: ValidationResult;
  sessionId: string;
  onRefresh: () => void;
  enrichmentStatus?: 'pending' | 'enriching' | 'done' | 'failed' | 'user_provided';
}) {
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ description: '', manufacturer: '', category: '', datasheet_url: '' });
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [suggestedFields, setSuggestedFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);

  const isConfirmed = r.status === 'valid';
  const hasParams = Object.keys(r.params ?? {}).length > 0;
  const hasCandidates = (r.candidates?.length ?? 0) > 1;
  const isEnriching = enrichmentStatus === 'pending' || enrichmentStatus === 'enriching';
  const formatSpecValue = (spec: unknown) => {
    if (spec == null) return '-';
    if (typeof spec !== 'object') return String(spec);
    const value = spec as { display_value?: unknown; value?: unknown; units?: unknown };
    if (value.display_value != null) return String(value.display_value);
    if (value.value != null) {
      return `${value.value}${value.units ? ` ${value.units}` : ''}`;
    }
    return JSON.stringify(spec);
  };

  const handleLoadFields = async () => {
    setLoadingFields(true);
    const fields = await suggestPartFields(sessionId, r.mpn, manualForm.description || null, manualForm.category || null);
    setSuggestedFields(fields);
    setExtraFields(Object.fromEntries(fields.map(f => [f, ''])));
    setLoadingFields(false);
  };

  const handleSaveManual = async () => {
    setSaving(true);
    try {
      await saveCustomPart(sessionId, r.mpn, {
        manufacturer: manualForm.manufacturer || undefined,
        description: manualForm.description || undefined,
        category: manualForm.category || undefined,
        datasheet_url: manualForm.datasheet_url || undefined,
        specs: Object.fromEntries(Object.entries(extraFields).filter(([, v]) => v)),
      });
      toast.success(`Specs saved for ${r.mpn}`);
      setShowManual(false);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      layout
      className={`rounded-xl border bg-white overflow-hidden transition-colors ${
        isConfirmed
          ? open ? 'border-blue-300 shadow-sm' : 'border-green-200 hover:border-blue-300'
          : 'border-amber-200'
      }`}
    >
      {/* Summary row - click to expand */}
      <button
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 group"
        onClick={() => setOpen(v => !v)}
      >
        {/* Status icon */}
        <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
          isConfirmed ? 'bg-green-100' : 'bg-amber-50'
        }`}>
          {isConfirmed
            ? <Cpu className="h-5 w-5 text-green-600" />
            : <AlertCircle className="h-5 w-5 text-amber-500" />}
        </div>

        {/* MPN + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-gray-900">{r.mpn}</span>
            {r.manufacturer && <span className="text-xs text-gray-500">{r.manufacturer}</span>}
            {isConfirmed ? (
              <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-medium">
                {r.source === 'nexar_confirmed' ? 'confirmed' : r.source || 'nexar'}
              </span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                no data
              </span>
            )}
          </div>
          {r.category && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">{r.category}</div>
          )}
        </div>

        {/* Confidence + chevron */}
        <div className="shrink-0 flex items-center gap-3">
          {isConfirmed && (r.confidence ?? 0) > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(r.confidence ?? 0) * 100}%` }} />
              </div>
              <span className="text-[10px] text-gray-400">{((r.confidence ?? 0) * 100).toFixed(0)}%</span>
            </div>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">

              {/* Key fields grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                {r.quantity != null && (
                  <div className="flex items-start gap-2">
                    <Hash className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Qty on BOM</div>
                      <div className="text-gray-800">{r.quantity}</div>
                    </div>
                  </div>
                )}
                {r.manufacturer && (
                  <div className="flex items-start gap-2">
                    <Factory className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Manufacturer</div>
                      <div className="text-gray-800">{r.manufacturer}</div>
                    </div>
                  </div>
                )}
                {r.category && (
                  <div className="flex items-start gap-2">
                    <Layers className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Category</div>
                      <div className="text-gray-800">{r.category}</div>
                    </div>
                  </div>
                )}
                {r.availability?.total_avail != null && (
                  <div className="flex items-start gap-2">
                    <Boxes className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Stock</div>
                      <div className="text-gray-800">{r.availability.total_avail.toLocaleString()} units</div>
                    </div>
                  </div>
                )}
                {r.pricing?.per_1000 != null && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Price / 1k</div>
                      <div className="text-gray-800">${r.pricing.per_1000.toFixed(4)}</div>
                    </div>
                  </div>
                )}
                {r.availability?.lead_time_days != null && (
                  <div className="flex items-start gap-2">
                    <Package className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Lead Time</div>
                      <div className="text-gray-800">{r.availability.lead_time_days} days</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {r.description && r.description !== r.mpn && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Description</div>
                  <p className="text-sm text-gray-700 leading-relaxed">{r.description}</p>
                </div>
              )}

              {/* Technical specs (params) */}
              {hasParams && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">
                    Technical Specifications
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(r.params ?? {}).map(([key, spec]) => (
                      <div key={key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-gray-500 truncate mr-2">{key}</span>
                        <span className="text-xs font-semibold text-gray-800 shrink-0">
                          {formatSpecValue(spec)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidates */}
              {hasCandidates && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">
                    Candidate Matches ({r.candidates?.length ?? 0})
                  </div>
                  <div className="space-y-1.5">
                    {(r.candidates ?? []).map((c, i) => (
                      <div key={c.mpn} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                        i === 0 ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'
                      }`}>
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-gray-900">{c.mpn}</span>
                          {c.category && <span className="text-gray-400 ml-2">{c.category}</span>}
                        </div>
                        {c.is_exact_match && (
                          <span className="text-green-600 font-medium shrink-0 ml-2">exact</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Datasheet + source footer */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Package className="h-3.5 w-3.5" />
                  <span>Source: {r.source || 'unknown'}</span>
                </div>
                {r.datasheet_url && (
                  <a
                    href={r.datasheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View Datasheet
                  </a>
                )}
              </div>

              {/* Enrichment in-progress indicator */}
              {isEnriching && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Extracting technical specs from datasheet...
                </div>
              )}

              {/* Unresolved: message + manual entry */}
              {!isConfirmed && !isEnriching && (
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    {r.message}
                  </div>
                  {!showManual ? (
                    <button
                      onClick={() => setShowManual(true)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <PenLine className="h-3.5 w-3.5" /> Enter specs manually
                    </button>
                  ) : (
                    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                      <div className="grid grid-cols-2 gap-2">
                        {(['description', 'manufacturer', 'category', 'datasheet_url'] as const).map(field => (
                          <div key={field} className={field === 'description' ? 'col-span-2' : ''}>
                            <label className="text-[11px] text-gray-500 block mb-0.5 capitalize">{field.replace('_', ' ')}</label>
                            <input
                              type="text"
                              value={manualForm[field]}
                              onChange={e => setManualForm(prev => ({ ...prev, [field]: e.target.value }))}
                              placeholder={field === 'datasheet_url' ? 'https://...' : ''}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                            />
                          </div>
                        ))}
                      </div>
                      {suggestedFields.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {suggestedFields.map(f => (
                            <div key={f}>
                              <label className="text-[11px] text-gray-500 block mb-0.5">{f.replace(/_/g, ' ')}</label>
                              <input
                                type="text"
                                value={extraFields[f] ?? ''}
                                onChange={e => setExtraFields(prev => ({ ...prev, [f]: e.target.value }))}
                                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleLoadFields}
                          disabled={loadingFields}
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          {loadingFields ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {suggestedFields.length > 0 ? 'Refresh fields' : 'Suggest spec fields'}
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => setShowManual(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        <button
                          onClick={handleSaveManual}
                          disabled={saving}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Main view

export function ValidationView({ components: _components, onValidationComplete }: ValidationViewProps) {
  const { sessionId, setCurrentStage, refreshTrigger } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [data, setData] = useState<{
    total_parts: number;
    valid_parts: number;
    invalid_parts: number;
    validation_results: ValidationResult[];
    auxiliary_parts_skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'confirmed' | 'unresolved'>('all');
  const [enrichmentStatuses, setEnrichmentStatuses] = useState<Record<string, 'pending' | 'enriching' | 'done' | 'failed' | 'user_provided'>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = (sid: string) =>
    getValidationResults(sid)
      .then(result => {
        if (result.success) {
          setData(result);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      setError('No session found. Please upload a BOM first.');
      return;
    }
    loadData(sessionId);
  }, [sessionId, refreshTrigger]);

  // Kick off background enrichment + poll status
  useEffect(() => {
    if (!sessionId || !data) return;
    let queuedCount = 0;

    const stop = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

    startEnrichFundamentals(sessionId)
      .then(r => { queuedCount = r.count; })
      .catch(() => {});

    const poll = async () => {
      try {
        const res = await getEnrichmentStatus(sessionId);
        setEnrichmentStatuses(res.statuses);
        const activelyEnriching = Object.values(res.statuses).some(s => s === 'enriching');
        if (res.all_done || (!activelyEnriching && queuedCount === 0)) {
          stop();
          if (res.done_count > 0) loadData(sessionId);
        }
      } catch { stop(); }
    };

    // Only start polling if there might be active enrichment
    pollRef.current = setInterval(poll, 3000);
    poll();
    return stop;
  }, [sessionId, data?.total_parts]);

  const filteredResults = (data?.validation_results ?? []).filter(r => {
    if (filterMode === 'confirmed' && r.status !== 'valid') return false;
    if (filterMode === 'unresolved' && r.status !== 'unresolved') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.mpn.toLowerCase().includes(q) ||
      (r.manufacturer ?? '').toLowerCase().includes(q) ||
      (r.category ?? '').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q);
  });

  const handleConfirm = async () => {
    if (!sessionId || !data) return;
    setIsConfirming(true);
    try {
      await confirmPartReview(sessionId, setCurrentStage);
      const components: Component[] = data.validation_results.map((r, i) => ({
        id: `comp-${r.mpn}-${i}`,
        reference: r.mpn,
        partNumber: r.mpn,
        manufacturer: r.manufacturer ?? undefined,
        description: r.description || r.mpn,
        type: r.category || 'IC',
        isIdentified: r.status === 'valid',
        isGeneric: r.status !== 'valid',
        complianceStatus: 'unknown' as const,
        specs: {},
      }));
      onValidationComplete(components);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading part review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto" />
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const confirmed = data.valid_parts;
  const unresolved = data.invalid_parts;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 bg-white border-b">
        <h1 className="text-lg font-semibold text-gray-900">Part Review</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Click any part to inspect specs - Review enrichment before requirements
        </p>
      </div>

      {/* Stats */}
      <div className="shrink-0 px-6 py-4 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">{data.total_parts}</div>
          <div className="text-xs text-gray-500 mt-1">Non-Aux Parts</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{confirmed}</div>
          <div className="text-xs text-gray-600 mt-1">Model Ready</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <div className="text-3xl font-bold text-amber-600">{unresolved}</div>
          <div className="text-xs text-gray-600 mt-1">Needs Attention</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{data.auxiliary_parts_skipped}</div>
          <div className="text-xs text-gray-600 mt-1">Auxiliary Skipped</div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="shrink-0 px-6 pb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search parts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['all', 'confirmed', 'unresolved'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterMode(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterMode === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? `All (${data.total_parts})` : f === 'confirmed' ? `Ready (${confirmed})` : `Needs attention (${unresolved})`}
            </button>
          ))}
        </div>
      </div>

      {/* Part list */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-2">
        {filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
            <Search className="h-8 w-8 mb-2 text-gray-300" />
            No results
          </div>
        ) : (
          filteredResults.map((r, idx) => (
            <PartCard
              key={`${r.mpn}-${idx}`}
              r={r}
              sessionId={sessionId!}
              onRefresh={() => loadData(sessionId!)}
              enrichmentStatus={enrichmentStatuses[r.mpn]}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t bg-white">
        {unresolved > 0 && (
          <p className="text-xs text-amber-700 mb-3 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {unresolved} part{unresolved !== 1 ? 's' : ''} need attention before architecture generation.
          </p>
        )}
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className="w-full rounded-xl bg-blue-600 py-3 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
        >
          {isConfirming ? (
            <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Confirming...</>
          ) : (
            <><Zap className="h-4 w-4" /> Confirm Parts & Continue <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}
