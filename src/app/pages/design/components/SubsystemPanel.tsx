import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Box, Check, FileText, Layers, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  confirmSubsystem,
  generateSubsystemRequirements,
  getSubsystemReadiness,
  getSubsystemRequirementsBySubsystemId,
  rejectSubsystem,
  type SubsystemReadinessResponse,
  type SubsystemRequirementItem,
} from '@/app/services/api';
import { toast } from 'sonner';
import { useDesignContext } from '../state/DesignContext';

type TabKey = 'parts' | 'mapped-reqs' | 'coverage' | 'sub-reqs';

const TABS: { key: TabKey; label: string; icon: typeof Box }[] = [
  { key: 'parts', label: 'Parts', icon: Box },
  { key: 'mapped-reqs', label: 'Mapped Requirements', icon: FileText },
  { key: 'coverage', label: 'Coverage', icon: ShieldCheck },
  { key: 'sub-reqs', label: 'Subsystem Requirements', icon: Layers },
];

export function SubsystemPanel() {
  const { panelOpenSubsystemId, setPanelOpenSubsystemId, displaySubsystems, technicalGraph } = useDesignContext();
  const isOpen = panelOpenSubsystemId !== null;

  const openSub = useMemo(() => {
    if (!panelOpenSubsystemId) return null;
    return displaySubsystems.find(s => (s.subsystem_id || s.id) === panelOpenSubsystemId) ?? null;
  }, [panelOpenSubsystemId, displaySubsystems]);

  // Camera zoom: when a subsystem opens, zoom to its member nodes; when it
  // closes, reset the viewport. SystemArchitectureView listens for this
  // event and calls React Flow's fitView.
  useEffect(() => {
    if (!isOpen || !openSub) {
      window.dispatchEvent(new CustomEvent('design:zoom-to-nodes', { detail: { nodeIds: [] } }));
      return;
    }
    const nodeIds = openSub.componentIds ?? openSub.mpns ?? openSub.bom_reference ?? [];
    window.dispatchEvent(new CustomEvent('design:zoom-to-nodes', { detail: { nodeIds } }));
  }, [isOpen, openSub]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isOpen ? 480 : 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="shrink-0 overflow-hidden border-l border-slate-200 bg-white"
    >
      {isOpen && openSub && (
        <PanelContent
          subsystem={openSub}
          onClose={() => setPanelOpenSubsystemId(null)}
          technicalGraphMode
        />
      )}
    </motion.aside>
  );
}

interface PanelContentProps {
  subsystem: ReturnType<typeof useDesignContext>['displaySubsystems'][number];
  onClose: () => void;
  technicalGraphMode?: boolean;
}

function PanelContent({ subsystem, onClose, technicalGraphMode = false }: PanelContentProps) {
  const [tab, setTab] = useState<TabKey>('parts');
  const visibleTab: TabKey =
    technicalGraphMode && tab !== 'parts' && tab !== 'mapped-reqs' ? 'parts' : tab;
  const { sessionId, subsystems: subsystemsState } = useDesignContext();
  const [reviewing, setReviewing] = useState<'confirm' | 'reject' | null>(null);
  const subId = subsystem.subsystem_id || subsystem.id;
  const status = (subsystem.status ?? 'suggested').toLowerCase();
  const isSuggested = status === 'suggested' && !technicalGraphMode;

  const handleConfirm = async () => {
    if (reviewing) return;
    setReviewing('confirm');
    try {
      await confirmSubsystem(sessionId, subId);
      await subsystemsState.reload();
      toast.success(`Confirmed ${subsystem.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm subsystem');
    } finally {
      setReviewing(null);
    }
  };

  const handleReject = async () => {
    if (reviewing) return;
    setReviewing('reject');
    try {
      await rejectSubsystem(sessionId, subId);
      await subsystemsState.reload();
      toast.success(`Rejected ${subsystem.name}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject subsystem');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div className="flex h-full w-[480px] flex-col">
      <header className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800 truncate">{subsystem.name}</h2>
          {subsystem.type && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {subsystem.type}
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSuggested
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : status === 'confirmed'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600'
            }`}
            title={isSuggested ? 'AI-suggested. Confirm or reject below.' : `Status: ${status}`}
          >
            {status}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close subsystem panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {subsystem.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{subsystem.description}</p>
        )}
        {isSuggested && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={reviewing !== null}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {reviewing === 'confirm' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Confirm subsystem
            </button>
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={reviewing !== null}
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {reviewing === 'reject' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Reject
            </button>
            <span className="text-[10px] text-slate-500">
              Required before generating its requirements.
            </span>
          </div>
        )}
      </header>

      <nav className="shrink-0 flex items-center gap-0 border-b border-slate-200 px-2 text-xs">
        {(technicalGraphMode ? TABS.filter(t => t.key === 'parts' || t.key === 'mapped-reqs') : TABS).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 border-b-2 px-3 py-2 transition-colors ${
              visibleTab === key
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        {visibleTab === 'parts' && <PartsTab subsystem={subsystem} />}
        {visibleTab === 'mapped-reqs' && <MappedRequirementsTab subsystem={subsystem} />}
        {!technicalGraphMode && visibleTab === 'coverage' && <CoverageTab subsystem={subsystem} />}
        {!technicalGraphMode && visibleTab === 'sub-reqs' && <SubsystemRequirementsTab subsystem={subsystem} />}
      </div>
    </div>
  );
}

function PartsTab({ subsystem }: { subsystem: PanelContentProps['subsystem'] }) {
  const parts = subsystem.parts ?? [];
  if (parts.length === 0) {
    return <div className="p-4 text-xs text-slate-500">No parts assigned to this subsystem.</div>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {parts.map((part, i) => {
        const label = part.mpn ?? part.part_number ?? '—';
        return (
          <li key={`${label}-${i}`} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-800">{label}</span>
              {part.category && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {part.category}
                </span>
              )}
            </div>
            {part.description && (
              <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-600">{part.description}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MappedRequirementsTab({ subsystem }: { subsystem: PanelContentProps['subsystem'] }) {
  // The subsystem payload already carries requirement_overlap_count and a
  // requirements array; show whichever is available. This is intentionally
  // lightweight — we link out to the requirement editor via the rail.
  const reqs = subsystem.requirements ?? [];
  if (reqs.length === 0) {
    return (
      <div className="p-4 text-xs text-slate-500">
        No design requirements have been mapped to this subsystem yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {reqs.map((req, i) => (
        <li key={`${req.req_id ?? i}`} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-slate-500">
              {req.req_key ?? req.req_id?.slice(0, 8) ?? '—'}
            </span>
            {req.priority && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {req.priority}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-800">{req.title ?? req.description ?? '—'}</div>
        </li>
      ))}
    </ul>
  );
}

function CoverageTab({ subsystem }: { subsystem: PanelContentProps['subsystem'] }) {
  const { sessionId } = useDesignContext();
  const [readiness, setReadiness] = useState<SubsystemReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSubsystemReadiness(sessionId)
      .then(r => {
        if (!cancelled) {
          setReadiness(r);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load coverage');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading coverage…
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-xs text-red-600">{error}</div>;
  }
  if (!readiness) {
    return <div className="p-4 text-xs text-slate-500">No coverage data yet.</div>;
  }

  // Filter readiness blockers down to ones that reference this subsystem.
  const subId = subsystem.subsystem_id || subsystem.id;
  const ownBlockers = (readiness.blockers ?? []).filter(b => {
    const payloadSubId = (b.payload as { subsystem_id?: string } | undefined)?.subsystem_id;
    return payloadSubId === subId;
  });

  return (
    <div className="space-y-3 p-4 text-xs">
      <div className="text-slate-600">
        Overall readiness:
        <span className="ml-1 font-semibold text-slate-800">
          {readiness.can_complete ? 'Ready to advance' : 'Has blockers'}
        </span>
        {' · '}
        {readiness.blockers?.length ?? 0} total blocker(s)
      </div>
      {ownBlockers.length === 0 ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
          No outstanding blockers for this subsystem.
        </div>
      ) : (
        <ul className="space-y-2">
          {ownBlockers.map((b, i) => (
            <li
              key={i}
              className={`rounded border p-2 ${
                b.severity === 'blocking'
                  ? 'border-red-200 bg-red-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className={b.severity === 'blocking' ? 'font-semibold text-red-900' : 'font-semibold text-amber-900'}>
                {b.label || b.type}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                {b.severity}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubsystemRequirementsTab({ subsystem }: { subsystem: PanelContentProps['subsystem'] }) {
  const { sessionId, subsystems: subsystemsState, refreshSubsystemRequirementsCount } = useDesignContext();
  const subId = subsystem.subsystem_id || subsystem.id;
  const [reqs, setReqs] = useState<SubsystemRequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getSubsystemRequirementsBySubsystemId(sessionId, subId)
      .then(r => {
        setReqs(r.requirements ?? []);
        setLoading(false);
      })
      .catch(err => {
        // 404 typically means none generated yet — treat as empty, not error.
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('404')) {
          setReqs([]);
          setLoading(false);
        } else {
          setError(msg || 'Failed to load subsystem requirements');
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSubsystemRequirementsBySubsystemId(sessionId, subId)
      .then(r => {
        if (!cancelled) {
          setReqs(r.requirements ?? []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('404')) {
          setReqs([]);
          setLoading(false);
        } else {
          setError(msg || 'Failed to load subsystem requirements');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [sessionId, subId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await generateSubsystemRequirements(sessionId, subId);
      setReqs(r.requirements ?? []);
      // Bump the design-wide subsystem-requirements count so Continue to
      // Review can re-check whether at least one subsystem has reqs now.
      refreshSubsystemRequirementsCount();
      toast.success(
        r.skipped
          ? 'Subsystem requirements already exist; nothing to generate.'
          : `Generated ${r.generated_count} subsystem requirements`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate subsystem requirements');
    } finally {
      setGenerating(false);
    }
  };

  // If the architecture changed since subsystems were loaded, surface a
  // "may be stale" badge here so the user knows to regenerate. Mirrors the
  // strip badge but in-context.
  const showStale = subsystemsState.isStale && reqs.length > 0;

  return (
    <div className="p-4 text-xs">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1 rounded border border-slate-200 bg-slate-900 px-2 py-1 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
          {generating ? 'Generating…' : reqs.length > 0 ? 'Regenerate' : 'Generate Subsystem Requirements'}
        </button>
        {showStale && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
            may be stale
          </span>
        )}
        <button
          type="button"
          onClick={load}
          className="ml-auto text-[11px] text-slate-500 hover:text-slate-700"
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : reqs.length === 0 ? null : (
        <ul className="space-y-2">
          {reqs.map((r, i) => (
            <li key={`${r.req_id ?? i}`} className="rounded border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-slate-500">
                  {r.req_key ?? r.req_id?.slice(0, 8) ?? '—'}
                </span>
                {r.priority && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {r.priority}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-slate-800">{r.title ?? r.description ?? '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
