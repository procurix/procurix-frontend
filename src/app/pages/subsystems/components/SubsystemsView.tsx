import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, GitBranch, Layers, MoveRight, Pencil, RefreshCw, Save, Shield, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';
import { Input } from '@/app/shared/components/ui/input';
import { Textarea } from '@/app/shared/components/ui/textarea';
import type { Component, Subsystem, SubsystemInterfaceSummary, SubsystemMappedRequirement, SubsystemPart } from '@/app/types';
import type { SubsystemConnection, SubsystemReadinessResponse } from '@/app/services/api';
import { SubsystemDiagramView } from './SubsystemDiagramView';

interface SubsystemsViewProps {
  subsystems: Subsystem[];
  components: Component[];
  subsystemConnections: SubsystemConnection[];
  readiness: SubsystemReadinessResponse | null;
  isGenerating: boolean;
  isCompleting: boolean;
  onRefresh: () => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  onConfirm: (subsystemId: string) => Promise<void> | void;
  onReject: (subsystemId: string) => Promise<void> | void;
  onMovePart: (designPartId: string, targetSubsystemId: string, sourceSubsystemId?: string) => Promise<void> | void;
  onUpdateSubsystem: (
    subsystemId: string,
    payload: {
      name?: string | null;
      description?: string | null;
      topology?: string | null;
      topology_family?: string | null;
    },
  ) => Promise<void> | void;
  onUpdateInterface: (
    interfaceId: string,
    payload: { signal_type?: string | null; description?: string | null },
  ) => Promise<void> | void;
  onComplete: () => Promise<void> | void;
}

function statusTone(status?: string) {
  if (status === 'confirmed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected') return 'border-gray-200 bg-gray-100 text-gray-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function statusLabel(status?: string) {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'rejected') return 'Rejected';
  return 'Suggested';
}

function partKey(part: SubsystemPart): string {
  return String(part?.design_part_id || part?.part_number || part?.mpn || '');
}

function partLabel(part: SubsystemPart): string {
  return String(part?.part_number || part?.mpn || part?.component_id || partKey(part) || 'Part');
}

type SubsystemEditDraft = {
  name: string;
  description: string;
  topology: string;
  topology_family: string;
};

type InterfaceEditDraft = {
  signal_type: string;
  description: string;
};

const TOPOLOGY_FAMILY_OPTIONS = ['functional', 'control', 'power', 'interface', 'sensing', 'mechanical', 'safety'];
const SIGNAL_TYPE_OPTIONS = ['signal', 'control', 'power', 'ground', 'data', 'analog', 'clock', 'feedback', 'differential'];

function subsystemEditDraft(subsystem: Subsystem): SubsystemEditDraft {
  return {
    name: subsystem.name || '',
    description: subsystem.description || '',
    topology: subsystem.topology || '',
    topology_family: subsystem.topology_family || '',
  };
}

function interfaceEditDraft(item: SubsystemInterfaceSummary): InterfaceEditDraft {
  return {
    signal_type: item.signal_type || item.primary_type || '',
    description: item.description || '',
  };
}

export function SubsystemsView({
  subsystems,
  components,
  subsystemConnections,
  readiness,
  isGenerating,
  isCompleting,
  onRefresh,
  onRegenerate,
  onConfirm,
  onReject,
  onMovePart,
  onUpdateSubsystem,
  onUpdateInterface,
  onComplete,
}: SubsystemsViewProps) {
  const activeSubsystems = useMemo(
    () => subsystems.filter((subsystem) => subsystem.status !== 'rejected'),
    [subsystems],
  );
  const [selectedId, setSelectedId] = useState<string | null>(activeSubsystems[0]?.id || null);
  const [tab, setTab] = useState<'review' | 'interfaces'>('review');
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isEditingSubsystem, setIsEditingSubsystem] = useState(false);
  const [subsystemDraft, setSubsystemDraft] = useState<SubsystemEditDraft | null>(null);
  const [editingInterfaceId, setEditingInterfaceId] = useState<string | null>(null);
  const [interfaceDraft, setInterfaceDraft] = useState<InterfaceEditDraft | null>(null);

  useEffect(() => {
    if (!activeSubsystems.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !activeSubsystems.some((subsystem) => subsystem.id === selectedId)) {
      setSelectedId(activeSubsystems[0].id);
    }
  }, [activeSubsystems, selectedId]);

  const selectedSubsystem = activeSubsystems.find((subsystem) => subsystem.id === selectedId) || activeSubsystems[0] || null;
  const canComplete = Boolean(readiness?.can_complete);
  const blockers = readiness?.blockers || [];
  const warnings = readiness?.warnings || [];
  const targetSubsystems = activeSubsystems.filter((subsystem) => subsystem.id !== selectedSubsystem?.id);

  useEffect(() => {
    if (!selectedSubsystem) {
      setSubsystemDraft(null);
      setIsEditingSubsystem(false);
      setEditingInterfaceId(null);
      setInterfaceDraft(null);
      return;
    }
    setSubsystemDraft(subsystemEditDraft(selectedSubsystem));
    setIsEditingSubsystem(false);
    setEditingInterfaceId(null);
    setInterfaceDraft(null);
  }, [selectedSubsystem]);

  const runAction = async (label: string, action: () => Promise<void> | void) => {
    setBusyAction(label);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Subsystem action failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSubsystemDraft = () => {
    if (!selectedSubsystem || !subsystemDraft) return;
    const name = subsystemDraft.name.trim();
    if (!name) {
      toast.error('Subsystem name is required');
      return;
    }
    void runAction(`save-subsystem-${selectedSubsystem.id}`, async () => {
      await onUpdateSubsystem(selectedSubsystem.id, {
        name,
        description: subsystemDraft.description.trim() || null,
        topology: subsystemDraft.topology.trim() || null,
        topology_family: subsystemDraft.topology_family.trim() || null,
      });
      setIsEditingSubsystem(false);
    });
  };

  const startInterfaceEdit = (item: SubsystemInterfaceSummary) => {
    if (!item.id) return;
    setEditingInterfaceId(item.id);
    setInterfaceDraft(interfaceEditDraft(item));
  };

  const handleSaveInterfaceDraft = (interfaceId: string) => {
    if (!interfaceDraft) return;
    void runAction(`save-interface-${interfaceId}`, async () => {
      await onUpdateInterface(interfaceId, {
        signal_type: interfaceDraft.signal_type.trim() || null,
        description: interfaceDraft.description.trim() || null,
      });
      setEditingInterfaceId(null);
      setInterfaceDraft(null);
    });
  };

  const focusBlocker = (blocker: { id: string | null; payload: Record<string, unknown> }) => {
    const subsystemId = String(blocker.payload?.subsystem_id || blocker.id || '');
    if (subsystemId && activeSubsystems.some((subsystem) => subsystem.id === subsystemId)) {
      setSelectedId(subsystemId);
      setTab('review');
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Subsystem Architecture</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review functional boundaries before generating subsystem requirements.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void onRefresh()} disabled={Boolean(busyAction)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => void runAction('regenerate', onRegenerate)} disabled={isGenerating || Boolean(busyAction)}>
              <GitBranch className="mr-2 h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Regenerate'}
            </Button>
            <Button onClick={() => void runAction('complete', onComplete)} disabled={!canComplete || isCompleting || Boolean(busyAction)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isCompleting ? 'Completing...' : 'Complete Subsystem Architecture'}
            </Button>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Subsystems</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{readiness?.counts.subsystems ?? activeSubsystems.length}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggested</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">{readiness?.counts.suggested_subsystems ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmed</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700">{readiness?.counts.confirmed_subsystems ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unassigned Important</div>
              <div className="mt-1 text-xl font-semibold text-red-700">{readiness?.counts.unassigned_important_parts ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unmapped Requirements</div>
              <div className="mt-1 text-xl font-semibold text-red-700">{readiness?.counts.unallocated_requirements ?? 0}</div>
            </div>
          </div>

          {blockers.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertCircle className="h-4 w-4" />
                {blockers.length} blocker{blockers.length === 1 ? '' : 's'} before completion
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {blockers.slice(0, 6).map((blocker, index) => (
                  <button
                    key={`${blocker.type}-${blocker.id || index}`}
                    type="button"
                    onClick={() => focusBlocker(blocker)}
                    className="rounded border border-amber-100 bg-white px-3 py-2 text-left text-xs text-amber-900 hover:border-amber-300"
                  >
                    {blocker.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && blockers.length === 0 && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {warnings[0].label}
            </div>
          )}
        </section>

        {activeSubsystems.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <Layers className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold text-slate-950">No active subsystem architecture yet</h2>
            <p className="mt-1 text-sm text-slate-600">
              Generate subsystem candidates from the approved architecture connections and requirement evidence.
            </p>
            <Button className="mt-4" onClick={() => void runAction('regenerate', onRegenerate)} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Subsystems'}
            </Button>
          </section>
        ) : (
          <div className="grid min-h-[620px] gap-5 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-3">
              {activeSubsystems.map((subsystem) => (
                <button
                  key={subsystem.id}
                  type="button"
                  onClick={() => setSelectedId(subsystem.id)}
                  className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-slate-400 ${
                    subsystem.id === selectedSubsystem?.id ? 'border-slate-900' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{subsystem.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{subsystem.type}</div>
                    </div>
                    <Badge variant="outline" className={statusTone(subsystem.status)}>
                      {statusLabel(subsystem.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <span>{subsystem.parts?.length || subsystem.componentIds.length} parts</span>
                    <span>{subsystem.requirements?.length || 0} reqs</span>
                    <span>{subsystem.interfaces?.length || 0} links</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {typeof subsystem.confidence === 'number' && (
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                        {Math.round(subsystem.confidence * 100)}% confidence
                      </span>
                    )}
                    {subsystem.user_corrected && (
                      <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Manual edits</span>
                    )}
                    {Boolean(subsystem.warnings?.length) && (
                      <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                        {subsystem.warnings?.length} warning{subsystem.warnings?.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </aside>

            <main className="rounded-lg border border-slate-200 bg-white shadow-sm">
              {selectedSubsystem && (
                <>
                  <div className="border-b border-slate-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isEditingSubsystem && subsystemDraft ? (
                          <div className="max-w-3xl space-y-3">
                            <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
                              <Input
                                value={subsystemDraft.name}
                                onChange={(event) => setSubsystemDraft((prev) => prev && { ...prev, name: event.target.value })}
                                placeholder="Subsystem name"
                              />
                              <Input
                                value={subsystemDraft.topology}
                                onChange={(event) => setSubsystemDraft((prev) => prev && { ...prev, topology: event.target.value })}
                                placeholder="Topology"
                              />
                              <select
                                value={subsystemDraft.topology_family}
                                onChange={(event) => setSubsystemDraft((prev) => prev && { ...prev, topology_family: event.target.value })}
                                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                              >
                                <option value="">Topology family</option>
                                {TOPOLOGY_FAMILY_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                            <Textarea
                              value={subsystemDraft.description}
                              onChange={(event) => setSubsystemDraft((prev) => prev && { ...prev, description: event.target.value })}
                              placeholder="Subsystem description"
                              className="min-h-[84px]"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-xl font-semibold text-slate-950">{selectedSubsystem.name}</h2>
                              <Badge variant="outline" className={statusTone(selectedSubsystem.status)}>
                                {statusLabel(selectedSubsystem.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 max-w-3xl text-sm text-slate-600">
                              {selectedSubsystem.description || 'No description provided yet.'}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isEditingSubsystem ? (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => {
                                if (selectedSubsystem) setSubsystemDraft(subsystemEditDraft(selectedSubsystem));
                                setIsEditingSubsystem(false);
                              }}
                              disabled={Boolean(busyAction)}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSaveSubsystemDraft}
                              disabled={Boolean(busyAction)}
                            >
                              <Save className="mr-2 h-4 w-4" />
                              Save
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSubsystemDraft(subsystemEditDraft(selectedSubsystem));
                              setIsEditingSubsystem(true);
                            }}
                            disabled={Boolean(busyAction)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => void runAction(`confirm-${selectedSubsystem.id}`, () => onConfirm(selectedSubsystem.id))}
                          disabled={isEditingSubsystem || selectedSubsystem.status === 'confirmed' || Boolean(busyAction)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Confirm
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void runAction(`reject-${selectedSubsystem.id}`, () => onReject(selectedSubsystem.id))}
                          disabled={isEditingSubsystem || Boolean(busyAction)}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant={tab === 'review' ? 'default' : 'outline'} size="sm" onClick={() => setTab('review')}>
                        Review
                      </Button>
                      <Button variant={tab === 'interfaces' ? 'default' : 'outline'} size="sm" onClick={() => setTab('interfaces')}>
                        Interfaces
                      </Button>
                    </div>
                  </div>

                  {tab === 'review' ? (
                    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_360px]">
                      <section className="space-y-5">
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
                            <Shield className="h-4 w-4" />
                            Rationale
                          </div>
                          <p className="text-sm text-slate-600">
                            {selectedSubsystem.rationale || 'Generated from architecture connectivity and requirement source evidence.'}
                          </p>
                        </div>

                        {Boolean(selectedSubsystem.warnings?.length) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
                              <AlertTriangle className="h-4 w-4" />
                              Review Notes
                            </div>
                            <ul className="space-y-1 text-sm text-amber-800">
                              {(selectedSubsystem.warnings || []).map((warning, index) => (
                                <li key={`${warning}-${index}`}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="rounded-lg border border-slate-200">
                          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">Parts</div>
                          <div className="divide-y divide-slate-100">
                            {(selectedSubsystem.parts || []).map((part: SubsystemPart) => {
                              const key = partKey(part);
                              const target = moveTargets[key] || '';
                              return (
                                <div key={key || partLabel(part)} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_220px_auto] md:items-center">
                                  <div>
                                    <div className="text-sm font-medium text-slate-950">{partLabel(part)}</div>
                                    <div className="text-xs text-slate-500">
                                      {[part.category, part.designator, part.component_id].filter(Boolean).join(' / ') || 'Architecture member'}
                                    </div>
                                  </div>
                                  <select
                                    value={target}
                                    onChange={(event) => setMoveTargets((prev) => ({ ...prev, [key]: event.target.value }))}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                                  >
                                    <option value="">Move to...</option>
                                    {targetSubsystems.map((subsystem) => (
                                      <option key={subsystem.id} value={subsystem.id}>
                                        {subsystem.name} ({subsystem.parts?.length || subsystem.componentIds.length} parts)
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!target || !key || Boolean(busyAction)}
                                    onClick={() => void runAction(`move-${key}`, () => onMovePart(key, target, selectedSubsystem.id))}
                                  >
                                    <MoveRight className="mr-2 h-4 w-4" />
                                    Move
                                  </Button>
                                </div>
                              );
                            })}
                            {(selectedSubsystem.parts || []).length === 0 && (
                              <div className="px-4 py-6 text-sm text-slate-500">No parts assigned.</div>
                            )}
                          </div>
                        </div>
                      </section>

                      <aside className="space-y-5">
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-3 text-sm font-semibold text-slate-950">Mapped Requirements</div>
                          <div className="space-y-2">
                            {(selectedSubsystem.requirements || []).map((requirement: SubsystemMappedRequirement) => (
                              <div key={requirement.req_id || requirement.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                                <div className="text-xs font-semibold text-slate-800">
                                  {requirement.req_key || requirement.id || 'Requirement'}
                                </div>
                                <div className="mt-1 line-clamp-3 text-xs text-slate-600">
                                  {requirement.title || requirement.description}
                                </div>
                              </div>
                            ))}
                            {(selectedSubsystem.requirements || []).length === 0 && (
                              <div className="text-sm text-slate-500">No mapped requirements yet.</div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-3 text-sm font-semibold text-slate-950">Interfaces</div>
                          <div className="space-y-2">
                            {(selectedSubsystem.interfaces || []).map((item: SubsystemInterfaceSummary) => (
                              <div key={item.id || `${item.source_subsystem_id}-${item.target_subsystem_id}`} className="rounded border border-slate-100 bg-slate-50 p-2">
                                {editingInterfaceId === item.id && interfaceDraft ? (
                                  <div className="space-y-2">
                                    <select
                                      value={interfaceDraft.signal_type}
                                      onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, signal_type: event.target.value })}
                                      className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                                    >
                                      <option value="">signal type</option>
                                      {SIGNAL_TYPE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                      ))}
                                    </select>
                                    <Textarea
                                      value={interfaceDraft.description}
                                      onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, description: event.target.value })}
                                      placeholder="Interface description"
                                      className="min-h-[72px] text-xs"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setEditingInterfaceId(null);
                                          setInterfaceDraft(null);
                                        }}
                                        disabled={Boolean(busyAction)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => item.id && handleSaveInterfaceDraft(item.id)}
                                        disabled={!item.id || Boolean(busyAction)}
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="text-xs font-semibold text-slate-800">{item.primary_type || item.signal_type || 'signal'}</div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => startInterfaceEdit(item)}
                                        disabled={!item.id || Boolean(busyAction)}
                                      >
                                        <Pencil className="mr-1 h-3 w-3" />
                                        Edit
                                      </Button>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-600">{item.description || 'Subsystem boundary interface'}</div>
                                  </>
                                )}
                              </div>
                            ))}
                            {(selectedSubsystem.interfaces || []).length === 0 && (
                              <div className="text-sm text-slate-500">No cross-subsystem interfaces.</div>
                            )}
                          </div>
                        </div>
                      </aside>
                    </div>
                  ) : (
                    <div className="h-[620px] p-5">
                      <SubsystemDiagramView
                        selectedSubsystem={selectedSubsystem}
                        allSubsystems={activeSubsystems}
                        allComponents={components}
                        connections={[]}
                        subsystemConnections={subsystemConnections}
                      />
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
