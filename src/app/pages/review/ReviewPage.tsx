import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import {
  getReview,
  markDesignComplete,
  type ReviewResponse,
  type ReviewSubsystem,
  type SubsystemInterfaceContract,
} from '@/app/services/api';
import { Badge } from '@/app/shared/components/ui/badge';
import { Button } from '@/app/shared/components/ui/button';
import { AlertTriangle, CheckCircle2, ChevronRight, Layers, Network, Package, ShieldCheck, Sparkles, Trophy } from 'lucide-react';

function statusTone(status?: string | null) {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-gray-100 text-gray-500 border-gray-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent || 'text-slate-950'}`}>{value}</div>
    </div>
  );
}

function StatusPills({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts || {}).filter(([, v]) => v > 0);
  if (entries.length === 0) return <div className="text-xs text-slate-400">none</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <Badge key={k} variant="outline" className={`text-[10px] ${statusTone(k)}`}>
          {k}: {v}
        </Badge>
      ))}
    </div>
  );
}

function interfaceLabel(item?: SubsystemInterfaceContract | null) {
  if (!item) return 'Interface';
  return item.name || item.label || item.net_id || item.connection_id || item.id || 'Interface';
}

function InterfaceContracts({ interfaces }: { interfaces: ReviewResponse['interfaces'] }) {
  const items = interfaces?.items || [];
  if (!interfaces || items.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-950">Interface Contracts</h2>
        </div>
        <div className="mt-3 text-sm text-slate-500">No subsystem interfaces defined.</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-950">Interface Contracts ({interfaces.total})</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <StatusPills counts={interfaces.by_status} />
          {interfaces.stale > 0 && (
            <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
              {interfaces.stale} stale
            </Badge>
          )}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((item) => {
          const linkedReqs = item.linked_subsystem_requirements || item.linked_requirements || [];
          const evidence = item.evidence || [];
          const source = item.source_subsystem_name || item.source_subsystem_id;
          const target = item.target_subsystem_name || item.target_subsystem_id;
          return (
            <div key={item.id || `${source}-${target}-${interfaceLabel(item)}`} className={`rounded border p-3 ${item.is_stale ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900">{interfaceLabel(item)}</span>
                <Badge variant="outline" className={`text-[10px] ${statusTone(item.status)}`}>{item.status || 'suggested'}</Badge>
                <Badge variant="outline" className="text-[10px] bg-white text-slate-600">{item.interface_type || item.signal_type || 'unknown'}</Badge>
                <span className="text-[10px] text-slate-500">{item.direction || 'unknown'}</span>
                {item.is_stale && <span className="text-[10px] text-orange-700">stale</span>}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                {source} -&gt; {target}
              </div>
              {item.description && (
                <div className="mt-1 text-[11px] text-slate-700 line-clamp-2">{item.description}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                <span>{evidence.length || item.evidence_count || 0} evidence</span>
                <span>{linkedReqs.length || item.linked_subsystem_requirements_count || item.linked_requirements_count || 0} reqs</span>
                {item.verification_method && <span>verify: {item.verification_method}</span>}
              </div>
              {Object.keys(item.constraints_json || {}).length > 0 && (
                <div className="mt-1 text-[10px] text-slate-600">
                  constraints: {Object.entries(item.constraints_json || {}).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(', ')}
                </div>
              )}
              {linkedReqs.length > 0 && (
                <div className="mt-2 space-y-1">
                  {linkedReqs.slice(0, 3).map((req) => (
                    <div key={req.req_id} className="rounded border border-slate-100 bg-white px-2 py-1 text-[10px] text-slate-700">
                      {req.req_key || req.req_id}: {req.title || req.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompletionBlockers({ blockers }: { blockers: NonNullable<ReviewResponse['completion_blockers']> }) {
  if (blockers.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        Resolve {blockers.length} blocker{blockers.length === 1 ? '' : 's'} before marking complete
      </div>
      <div className="space-y-1.5">
        {blockers.slice(0, 6).map((blocker, index) => (
          <div key={`${blocker.type}-${blocker.id ?? index}`} className="flex items-start gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
            <span>{blocker.label}</span>
          </div>
        ))}
        {blockers.length > 6 && (
          <div className="text-xs font-medium text-amber-800">
            {blockers.length - 6} more blocker{blockers.length - 6 === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </section>
  );
}

function SubsystemBlock({ sub, navigate, sessionId }: { sub: ReviewSubsystem; navigate: (path: string) => void; sessionId: string }) {
  const confirmedReqs = (sub.requirements || []).filter((r) => r.status === 'confirmed').length;
  const totalReqs = (sub.requirements || []).filter((r) => r.status !== 'rejected').length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-950">{sub.name}</span>
            <Badge variant="outline" className={`text-[10px] ${statusTone(sub.status)}`}>{sub.status}</Badge>
            {sub.user_corrected && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">user-edited</Badge>
            )}
            {sub.topology_family && (
              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600">{sub.topology_family}</Badge>
            )}
          </div>
          {sub.description && (
            <div className="mt-1 text-xs text-slate-600">{sub.description}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span>{sub.part_count} part{sub.part_count === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{totalReqs} requirement{totalReqs === 1 ? '' : 's'} ({confirmedReqs} confirmed)</span>
            {typeof sub.confidence === 'number' && (
              <>
                <span>·</span>
                <span>confidence {(sub.confidence * 100).toFixed(0)}%</span>
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/subsystems?session=${sessionId}`)}
          className="h-7 text-xs"
        >
          Edit <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-100 bg-slate-50 p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase text-slate-500">Parts</div>
          {sub.parts.length === 0 ? (
            <div className="text-xs text-slate-500">No parts assigned.</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sub.parts.map((p) => (
                <Badge key={p.design_part_id} variant="outline" className="text-[10px] bg-white">
                  {p.mpn || p.designator || p.design_part_id}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="rounded border border-slate-100 bg-slate-50 p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase text-slate-500">Subsystem Requirements</div>
          {(sub.requirements || []).length === 0 ? (
            <div className="text-xs text-slate-500">No subsystem requirements generated.</div>
          ) : (
            <div className="space-y-1.5">
              {sub.requirements.map((r) => (
                <div key={r.req_id} className={`rounded p-1.5 ${r.stale ? 'bg-orange-50 border border-orange-200' : 'bg-white border border-slate-100'}`}>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="font-semibold text-slate-700">{r.req_key || 'REQ'}</span>
                    <Badge variant="outline" className={`text-[9px] ${statusTone(r.status)}`}>{r.status}</Badge>
                    {r.priority && <span className="text-slate-500">{r.priority.replace('_', ' ')}</span>}
                    {r.stale && <span className="text-orange-700">⚠ stale</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-700 line-clamp-2">{r.title || r.description}</div>
                  {r.parent_req_id && (
                    <div className="mt-0.5 text-[9px] text-blue-700">
                      ↳ implements {r.parent_req_key || r.parent_req_id}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const activeSessionId = querySessionId || contextSessionId;
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  const load = useCallback(async () => {
    if (!activeSessionId) {
      setError('No session ID — navigate here from a previous step.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    if (!querySessionId) updateParams(activeSessionId);
    try {
      const r = await getReview(activeSessionId);
      setReview(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review.');
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, querySessionId, updateParams]);

  useEffect(() => { void load(); }, [load]);

  const handleComplete = async () => {
    if (!activeSessionId) return;
    setIsCompleting(true);
    try {
      const result = await markDesignComplete(activeSessionId);
      if (result.already_complete) {
        toast.info('Design was already marked complete.');
      } else {
        toast.success('Design marked complete!');
      }
      navigate(`/completed?session=${activeSessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete design.');
    } finally {
      setIsCompleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error ?? 'No data available.'}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      </div>
    );
  }

  const sessionId = activeSessionId!;
  const completionBlockers = review.completion_blockers ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{review.project_name || 'Design Review'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {review.system_profile.system_type || 'Unknown system'}
            {review.system_profile.primary_function ? ` — ${review.system_profile.primary_function}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={statusTone(review.is_complete ? 'confirmed' : 'suggested')}>
              FSM: {review.fsm_state}
            </Badge>
            {(review.standards || []).map((s) => (
              <Badge key={s} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                <ShieldCheck className="mr-1 h-3 w-3" /> {s}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={!review.can_complete || isCompleting}
          title={review.can_complete ? 'Mark design complete' : `Current state ${review.fsm_state} cannot transition to complete`}
        >
          <Trophy className="mr-2 h-4 w-4" />
          {review.is_complete
            ? 'Already complete'
            : isCompleting
              ? 'Completing...'
              : 'Mark Complete'}
        </Button>
      </header>

      <CompletionBlockers blockers={completionBlockers} />

      {/* Stat strip */}
      <section className="grid gap-3 md:grid-cols-6">
        <StatCard label="Parts" value={review.parts_summary.total} accent="text-slate-950" />
        <StatCard label="Subsystems" value={review.subsystem_count} accent="text-slate-950" />
        <StatCard label="Connections" value={review.connections.total} accent="text-slate-950" />
        <StatCard label="Interfaces" value={review.interfaces?.total ?? review.interfaces_count} accent="text-slate-950" />
        <StatCard
          label="Design Requirements"
          value={review.design_requirements.total}
          accent="text-slate-950"
        />
        <StatCard
          label="Subsystem Requirements"
          value={review.subsystem_requirements.total}
          accent="text-slate-950"
        />
      </section>

      {/* Status pill strip */}
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connections</div>
          <div className="mt-1.5"><StatusPills counts={review.connections.by_status} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interfaces</div>
          <div className="mt-1.5"><StatusPills counts={review.interfaces?.by_status || {}} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Design Reqs</div>
          <div className="mt-1.5"><StatusPills counts={review.design_requirements.by_status} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subsystem Reqs</div>
          <div className="mt-1.5"><StatusPills counts={review.subsystem_requirements.by_status} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stale Reqs</div>
          <div className={`mt-1.5 text-lg font-semibold ${review.subsystem_requirements.stale > 0 ? 'text-orange-700' : 'text-slate-700'}`}>
            {review.subsystem_requirements.stale}
          </div>
        </div>
      </section>

      <InterfaceContracts interfaces={review.interfaces} />

      {/* Parts summary */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-950">Parts</h2>
          </div>
          <div className="text-xs text-slate-500">
            {Object.entries(review.parts_summary.by_classification).map(([k, v]) => (
              <span key={k} className="ml-2"><strong>{v}</strong> {k}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {review.parts_summary.parts.map((p) => (
            <Badge key={p.design_part_id} variant="outline" className="text-[10px] bg-slate-50">
              {p.mpn || p.designator || p.design_part_id}
              {p.classification ? ` · ${p.classification}` : ''}
            </Badge>
          ))}
        </div>
      </section>

      {/* Subsystems */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-950">Subsystems ({review.subsystem_count})</h2>
        </div>
        {review.subsystems.length === 0 ? (
          <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No subsystems defined yet.
          </div>
        ) : (
          review.subsystems.map((sub) => (
            <SubsystemBlock key={sub.subsystem_id} sub={sub} navigate={navigate} sessionId={sessionId} />
          ))
        )}
      </section>

      {/* Design Requirements with chain */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-950">
              Design Requirements ({review.design_requirements.total})
            </h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/requirements?session=${sessionId}`)}
            className="h-7 text-xs"
          >
            Edit <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        {review.design_requirements.items.length === 0 ? (
          <div className="text-sm text-slate-500">No design requirements yet.</div>
        ) : (
          <div className="space-y-2">
            {review.design_requirements.items.map((r) => (
              <div key={r.req_id} className="rounded border border-slate-100 bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">{r.req_key || 'REQ'}</span>
                  <Badge variant="outline" className={`text-[10px] ${statusTone(r.status)}`}>{r.status}</Badge>
                  {r.category && <span className="text-[10px] text-slate-500">{r.category}</span>}
                  {r.priority && <span className="text-[10px] text-slate-500">{r.priority.replace('_', ' ')}</span>}
                  {r.child_subsystem_req_count > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                      ↳ {r.child_subsystem_req_count} subsystem req{r.child_subsystem_req_count === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs font-medium text-slate-900">{r.title || '(untitled)'}</div>
                <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">{r.description}</div>
                {(r.child_subsystem_requirements || []).length > 0 ? (
                  <div className="mt-2 grid gap-1 md:grid-cols-2">
                    {(r.child_subsystem_requirements || []).map((child) => (
                      <div key={child.req_id} className={`rounded border px-2 py-1 text-[10px] ${child.stale ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-100 bg-white text-slate-700'}`}>
                        <div className="font-semibold">{child.req_key || child.req_id}</div>
                        <div className="line-clamp-1">{child.title || 'Subsystem requirement'}</div>
                        <div className="text-slate-500">
                          {child.subsystem_name || child.subsystem_id}
                          {child.interface_id ? ` / interface ${child.interface_label || child.interface_id}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  r.status === 'confirmed' && (
                    <div className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1 text-[10px] text-red-700">
                      No subsystem requirement coverage.
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Mark Complete (sticky-ish) */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={!review.can_complete || isCompleting}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {review.is_complete ? 'Already complete' : isCompleting ? 'Completing...' : 'Mark Complete'}
        </Button>
      </div>
    </div>
  );
}
