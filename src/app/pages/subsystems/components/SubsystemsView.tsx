import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, GitBranch, Layers, MoveRight, Pencil, Plus, RefreshCw, Save, Shield, Sparkles, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';
import { Input } from '@/app/shared/components/ui/input';
import { Textarea } from '@/app/shared/components/ui/textarea';
import { ConfirmActionDialog } from '@/app/shared/components/ConfirmActionDialog';
import type { Component, Subsystem, SubsystemInterfaceSummary, SubsystemMappedRequirement, SubsystemPart } from '@/app/types';
import type {
  Connection,
  SubsystemConnection,
  SubsystemInterfaceEvidence,
  SubsystemReadinessResponse,
  SubsystemRequirementCoverageResponse,
  SubsystemRequirementItem,
  SubsystemReviewProposal,
  SubsystemReviewProposalStatus,
  SubsystemReviewProposalType,
} from '@/app/services/api';
import { SubsystemDiagramView } from './SubsystemDiagramView';

interface SubsystemsViewProps {
  subsystems: Subsystem[];
  components: Component[];
  subsystemConnections: SubsystemConnection[];
  architectureConnections: Connection[];
  readiness: SubsystemReadinessResponse | null;
  coverage: SubsystemRequirementCoverageResponse | null;
  isGenerating: boolean;
  isCompleting: boolean;
  onRefresh: () => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  onConfirm: (subsystemId: string) => Promise<void> | void;
  onReject: (subsystemId: string) => Promise<void> | void;
  onCreateSubsystem: (payload: {
    name: string;
    description?: string | null;
    topology?: string | null;
    topology_family?: string | null;
  }) => Promise<void> | void;
  onAddPart: (subsystemId: string, designPartId: string) => Promise<void> | void;
  onRemovePart: (subsystemId: string, designPartId: string) => Promise<void> | void;
  onMovePart: (designPartId: string, targetSubsystemId: string, sourceSubsystemId?: string) => Promise<void> | void;
  onMergeSubsystems: (payload: {
    source_subsystem_ids: string[];
    target_subsystem_id?: string | null;
    target_name?: string | null;
  }) => Promise<void> | void;
  onSplitSubsystem: (
    subsystemId: string,
    groups: Array<{ name: string; part_ids: string[] }>,
  ) => Promise<void> | void;
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
    payload: {
      name?: string | null;
      interface_type?: string | null;
      signal_type?: string | null;
      direction?: string | null;
      description?: string | null;
      constraints_json?: Record<string, unknown> | null;
      verification_method?: string | null;
      rationale?: string | null;
    },
  ) => Promise<void> | void;
  onConfirmInterface: (interfaceId: string) => Promise<void> | void;
  onRejectInterface: (interfaceId: string) => Promise<void> | void;
  onLoadInterfaceEvidence: (interfaceId: string) => Promise<SubsystemInterfaceEvidence[]>;
  onComplete: () => Promise<void> | void;
  // Subsystem requirements
  onGenerateSubReqs?: (subsystemId: string) => Promise<void> | void;
  onGenerateAllSubReqs?: () => Promise<void> | void;
  onRegenerateStaleSubReqs?: () => Promise<void> | void;
  onConfirmSubReq?: (reqId: string) => Promise<void> | void;
  onRejectSubReq?: (reqId: string) => Promise<void> | void;
  onDeleteSubReq?: (reqId: string) => Promise<void> | void;
  onUpdateSubReq?: (reqId: string, fields: Partial<SubsystemRequirementItem>) => Promise<void> | void;
  onCreateSubReq?: (subsystemId: string, fields: Partial<SubsystemRequirementItem>) => Promise<void> | void;
  isGeneratingSubReqs?: boolean;
  reviewProposals: SubsystemReviewProposal[];
  reviewProposalFilter: SubsystemReviewProposalStatus;
  reviewProposalsLoading: boolean;
  reviewProposalsError: string | null;
  suggestionsAvailable: boolean | null;
  isSuggestingReview: boolean;
  onReviewProposalFilterChange: (status: SubsystemReviewProposalStatus) => Promise<void> | void;
  onSuggestReviewProposals: () => Promise<void> | void;
  onApplyReviewProposal: (proposalId: string) => Promise<void> | void;
  onDismissReviewProposal: (proposalId: string, reason?: string) => Promise<void> | void;
}

type SubReqDraft = {
  title: string;
  description: string;
  priority: string;
  acceptance_criteria: string;
  verification_method: string;
  parent_req_id: string;
  interface_id: string;
  mapped_part_ids: string[];
};

const VERIFICATION_METHOD_OPTIONS = ['inspection', 'analysis', 'test', 'simulation', 'review'];
const PRIORITY_OPTIONS = ['must_have', 'should_have', 'nice_to_have'];

function subReqDraft(req?: Partial<SubsystemRequirementItem>): SubReqDraft {
  return {
    title: req?.title || '',
    description: req?.description || '',
    priority: req?.priority || 'must_have',
    acceptance_criteria: req?.acceptance_criteria || '',
    verification_method: req?.verification_method || '',
    parent_req_id: req?.parent_req_id || '',
    interface_id: req?.interface_id || '',
    mapped_part_ids: req?.mapped_part_ids || [],
  };
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
  name: string;
  interface_type: string;
  direction: string;
  description: string;
  constraintsText: string;
  verification_method: string;
  rationale: string;
};

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

const TOPOLOGY_FAMILY_OPTIONS = ['functional', 'control', 'power', 'interface', 'sensing', 'mechanical', 'safety'];
const INTERFACE_TYPE_OPTIONS = ['power', 'ground', 'signal', 'data', 'control', 'mechanical', 'thermal', 'material', 'mixed', 'unknown'];
const INTERFACE_DIRECTION_OPTIONS = ['a_to_b', 'b_to_a', 'bidirectional', 'unknown'];
const INTERFACE_CONSTRAINT_HINTS: Record<string, string[]> = {
  power: ['voltage_nominal', 'voltage_min', 'voltage_max', 'current_max', 'ripple_max'],
  data: ['protocol', 'bandwidth', 'latency_max', 'logic_level'],
  control: ['logic_level', 'active_state', 'response_time_max'],
};

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
    name: item.name || '',
    interface_type: item.interface_type || item.signal_type || item.primary_type || 'signal',
    direction: item.direction || 'unknown',
    description: item.description || '',
    constraintsText: item.constraints_json ? JSON.stringify(item.constraints_json, null, 2) : '',
    verification_method: item.verification_method || '',
    rationale: item.rationale || '',
  };
}

function parseConstraints(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Constraints must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Constraints must be valid JSON, for example {"voltage_nominal":"5V"}');
  }
}

const REVIEW_PROPOSAL_FILTERS: SubsystemReviewProposalStatus[] = ['pending', 'applied', 'dismissed', 'invalid'];
const CONFIRM_REVIEW_PROPOSAL_TYPES = new Set<SubsystemReviewProposalType>([
  'move_part',
  'merge_subsystems',
  'split_subsystem',
  'create_interface_requirement',
]);

function reviewProposalTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    rename_subsystem: 'Rename',
    move_part: 'Move part',
    merge_subsystems: 'Merge',
    split_subsystem: 'Split',
    create_interface_requirement: 'Interface requirement',
    flag_weak_member: 'Weak member',
    flag_unmapped_requirement: 'Unmapped requirement',
    flag_duplicate_name: 'Duplicate name',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

function reviewProposalStatusTone(status: SubsystemReviewProposalStatus): string {
  if (status === 'applied') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'dismissed') return 'border-gray-200 bg-gray-100 text-gray-500';
  if (status === 'invalid') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function readPayloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function readPayloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function subsystemLabel(subsystems: Subsystem[], subsystemId?: string | null): string {
  if (!subsystemId) return 'Unknown subsystem';
  const subsystem = subsystems.find((item) => item.id === subsystemId || item.subsystem_id === subsystemId);
  if (!subsystem) return subsystemId;
  return subsystem.subsystem_key ? `${subsystem.subsystem_key} ${subsystem.name}` : subsystem.name;
}

function partIdForSubsystemPart(part: SubsystemPart): string {
  return String(part.design_part_id || part.part_number || part.mpn || part.component_id || '');
}

function proposalPartLabel(
  partId: string,
  subsystems: Subsystem[],
  components: Component[],
): string {
  for (const subsystem of subsystems) {
    const part = (subsystem.parts || []).find((candidate) => partIdForSubsystemPart(candidate) === partId);
    if (part) return partLabel(part);
  }
  const component = components.find((candidate) => candidate.id === partId);
  return component?.partNumber || component?.reference || partId;
}

function proposalRequirementLabel(
  requirementId: string,
  coverage: SubsystemRequirementCoverageResponse | null,
): string {
  const allRequirements = [
    ...(coverage?.design_requirements || []),
    ...(coverage?.uncovered_requirements || []),
  ];
  const requirement = allRequirements.find((item) => item.id === requirementId || item.req_id === requirementId);
  if (!requirement) return requirementId;
  return requirement.req_key || requirement.req_id || requirement.title || requirementId;
}

function proposalInterfaceLabel(interfaceId: string, subsystems: Subsystem[]): string {
  for (const subsystem of subsystems) {
    const found = (subsystem.interfaces || []).find((item) => item.id === interfaceId);
    if (found) return found.name || found.interface_type || found.signal_type || interfaceId;
  }
  return interfaceId;
}

function formatProposalTarget(
  proposal: SubsystemReviewProposal,
  subsystems: Subsystem[],
  coverage: SubsystemRequirementCoverageResponse | null,
  components: Component[],
): string {
  const payload = proposal.payload || {};
  if (proposal.proposal_type === 'rename_subsystem') {
    const subsystem = subsystemLabel(subsystems, readPayloadString(payload, 'subsystem_id'));
    const newName = readPayloadString(payload, 'new_name');
    return newName ? `${subsystem} -> ${newName}` : subsystem;
  }
  if (proposal.proposal_type === 'move_part') {
    const part = proposalPartLabel(readPayloadString(payload, 'design_part_id'), subsystems, components);
    return `${part} -> ${subsystemLabel(subsystems, readPayloadString(payload, 'target_subsystem_id'))}`;
  }
  if (proposal.proposal_type === 'merge_subsystems') {
    const sources = readPayloadStringArray(payload, 'source_subsystem_ids')
      .map((id) => subsystemLabel(subsystems, id))
      .join(', ');
    const target = readPayloadString(payload, 'target_subsystem_id')
      ? subsystemLabel(subsystems, readPayloadString(payload, 'target_subsystem_id'))
      : readPayloadString(payload, 'target_name') || 'new subsystem';
    return `${sources || 'Selected subsystems'} -> ${target}`;
  }
  if (proposal.proposal_type === 'split_subsystem') {
    const groups = Array.isArray(payload.groups) ? payload.groups.length : 0;
    return `${subsystemLabel(subsystems, readPayloadString(payload, 'source_subsystem_id'))} into ${groups || 'multiple'} groups`;
  }
  if (proposal.proposal_type === 'create_interface_requirement') {
    return `${subsystemLabel(subsystems, readPayloadString(payload, 'subsystem_id'))} / ${proposalInterfaceLabel(readPayloadString(payload, 'interface_id'), subsystems)}`;
  }
  if (proposal.proposal_type === 'flag_weak_member') {
    const part = proposalPartLabel(readPayloadString(payload, 'design_part_id'), subsystems, components);
    return `${part} in ${subsystemLabel(subsystems, readPayloadString(payload, 'subsystem_id'))}`;
  }
  if (proposal.proposal_type === 'flag_unmapped_requirement') {
    return proposalRequirementLabel(readPayloadString(payload, 'requirement_id'), coverage);
  }
  if (proposal.proposal_type === 'flag_duplicate_name') {
    return readPayloadStringArray(payload, 'subsystem_ids')
      .map((id) => subsystemLabel(subsystems, id))
      .join(', ') || 'Duplicate subsystem names';
  }
  return proposal.id;
}

export function SubsystemsView({
  subsystems,
  components,
  subsystemConnections,
  architectureConnections,
  readiness,
  coverage,
  isGenerating,
  isCompleting,
  onRefresh,
  onRegenerate,
  onConfirm,
  onReject,
  onCreateSubsystem,
  onAddPart,
  onRemovePart,
  onMovePart,
  onMergeSubsystems,
  onSplitSubsystem,
  onUpdateSubsystem,
  onUpdateInterface,
  onConfirmInterface,
  onRejectInterface,
  onLoadInterfaceEvidence,
  onComplete,
  onGenerateSubReqs,
  onGenerateAllSubReqs,
  onRegenerateStaleSubReqs,
  onConfirmSubReq,
  onRejectSubReq,
  onDeleteSubReq,
  onUpdateSubReq,
  onCreateSubReq,
  isGeneratingSubReqs,
  reviewProposals,
  reviewProposalFilter,
  reviewProposalsLoading,
  reviewProposalsError,
  suggestionsAvailable,
  isSuggestingReview,
  onReviewProposalFilterChange,
  onSuggestReviewProposals,
  onApplyReviewProposal,
  onDismissReviewProposal,
}: SubsystemsViewProps) {
  const [editingSubReqId, setEditingSubReqId] = useState<string | null>(null);
  const [creatingSubReq, setCreatingSubReq] = useState(false);
  const [subReqEditDraft, setSubReqEditDraft] = useState<SubReqDraft | null>(null);
  const activeSubsystems = useMemo(
    () => subsystems.filter((subsystem) => subsystem.status !== 'rejected'),
    [subsystems],
  );
  const [selectedId, setSelectedId] = useState<string | null>(activeSubsystems[0]?.id || null);
  const [tab, setTab] = useState<'review' | 'interfaces'>('review');
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [addPartTarget, setAddPartTarget] = useState('');
  const [showCreateSubsystem, setShowCreateSubsystem] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: '', description: '', topology_family: 'functional' });
  const [selectedForMerge, setSelectedForMerge] = useState<Record<string, boolean>>({});
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [showSplit, setShowSplit] = useState(false);
  const [splitNames, setSplitNames] = useState(['Group 1', 'Group 2']);
  const [splitAssignments, setSplitAssignments] = useState<Record<string, number>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isEditingSubsystem, setIsEditingSubsystem] = useState(false);
  const [subsystemDraft, setSubsystemDraft] = useState<SubsystemEditDraft | null>(null);
  const [editingInterfaceId, setEditingInterfaceId] = useState<string | null>(null);
  const [interfaceDraft, setInterfaceDraft] = useState<InterfaceEditDraft | null>(null);
  const [interfaceEvidence, setInterfaceEvidence] = useState<Record<string, SubsystemInterfaceEvidence[]>>({});

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
  const selectedMergeIds = activeSubsystems
    .filter((subsystem) => selectedForMerge[subsystem.id])
    .map((subsystem) => subsystem.id);
  const designRequirements = coverage?.design_requirements || [];
  const unassignedBlockerParts = blockers
    .filter((blocker) => blocker.type === 'unassigned_important_part')
    .map((blocker) => ({
      id: String(blocker.payload?.design_part_id || blocker.id || ''),
      label: String(blocker.payload?.mpn || blocker.label || blocker.id || 'Part'),
    }))
    .filter((part) => part.id);
  const componentOptions = [
    ...components.map((component) => ({
      id: component.id,
      label: component.partNumber || component.reference || component.id,
    })),
    ...unassignedBlockerParts,
  ].filter((item, index, all) => item.id && all.findIndex((candidate) => candidate.id === item.id) === index);
  const selectedPartIds = new Set((selectedSubsystem?.parts || []).map((part) => partKey(part)).filter(Boolean));
  const assignableParts = componentOptions.filter((part) => !selectedPartIds.has(part.id));

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

  const createManualSubsystem = () => {
    const name = createDraft.name.trim();
    if (!name) {
      toast.error('Subsystem name is required');
      return;
    }
    void runAction('create-subsystem', async () => {
      await onCreateSubsystem({
        name,
        description: createDraft.description.trim() || null,
        topology_family: createDraft.topology_family || null,
      });
      setCreateDraft({ name: '', description: '', topology_family: 'functional' });
      setShowCreateSubsystem(false);
    });
  };

  const assignPartToSelected = () => {
    if (!selectedSubsystem || !addPartTarget) return;
    void runAction(`assign-${addPartTarget}`, async () => {
      await onAddPart(selectedSubsystem.id, addPartTarget);
      setAddPartTarget('');
    });
  };

  const mergeSelectedSubsystems = () => {
    if (selectedMergeIds.length < 2) {
      toast.error('Select at least two subsystems to merge');
      return;
    }
    const targetId = mergeTargetId || null;
    const sourceIds = targetId
      ? selectedMergeIds.filter((id) => id !== targetId)
      : selectedMergeIds;
    if (!sourceIds.length) {
      toast.error('Choose at least one source subsystem');
      return;
    }
    const affectedNames = activeSubsystems
      .filter((subsystem) => selectedMergeIds.includes(subsystem.id))
      .map((subsystem) => subsystem.name)
      .join(', ');
    setConfirmation({
      title: 'Merge subsystems?',
      description: `This cannot be undone. ${affectedNames || 'The selected subsystems'} will be merged, source subsystems will be rejected, and linked subsystem requirements may need review.`,
      confirmLabel: 'Merge permanently',
      onConfirm: () => {
        setConfirmation(null);
        void runAction('merge-subsystems', async () => {
          await onMergeSubsystems({
            source_subsystem_ids: sourceIds,
            target_subsystem_id: targetId,
            target_name: mergeTargetName.trim() || null,
          });
          setShowMerge(false);
          setMergeTargetId('');
          setMergeTargetName('');
          setSelectedForMerge({});
        });
      },
    });
  };

  const startSplit = () => {
    if (!selectedSubsystem) return;
    const assignments: Record<string, number> = {};
    (selectedSubsystem.parts || []).forEach((part, index) => {
      const key = partKey(part);
      if (key) assignments[key] = index === 0 ? 0 : 1;
    });
    setSplitAssignments(assignments);
    setSplitNames(['Group 1', 'Group 2']);
    setShowSplit(true);
  };

  const splitSelectedSubsystem = () => {
    if (!selectedSubsystem) return;
    const groups = splitNames.map((name, groupIndex) => ({
      name: name.trim() || `Group ${groupIndex + 1}`,
      part_ids: Object.entries(splitAssignments)
        .filter(([, assignedGroup]) => assignedGroup === groupIndex)
        .map(([partId]) => partId),
    }));
    if (groups.some((group) => group.part_ids.length === 0)) {
      toast.error('Each split group must contain at least one part');
      return;
    }
    const assignedCount = groups.reduce((total, group) => total + group.part_ids.length, 0);
    if (assignedCount !== (selectedSubsystem.parts || []).length) {
      toast.error('Every active part must be assigned to exactly one split group');
      return;
    }
    setConfirmation({
      title: 'Split subsystem?',
      description: `This cannot be undone. ${selectedSubsystem.name} will be rejected and replaced by ${groups.length} confirmed manual subsystems. Linked subsystem requirements may need review.`,
      confirmLabel: 'Split permanently',
      onConfirm: () => {
        setConfirmation(null);
        void runAction(`split-${selectedSubsystem.id}`, async () => {
          await onSplitSubsystem(selectedSubsystem.id, groups);
          setShowSplit(false);
          setSplitAssignments({});
        });
      },
    });
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
    if (!interfaceEvidence[item.id]) {
      void onLoadInterfaceEvidence(item.id)
        .then((rows) => setInterfaceEvidence((prev) => ({ ...prev, [item.id as string]: rows })))
        .catch(() => undefined);
    }
  };

  const handleSaveInterfaceDraft = (interfaceId: string) => {
    if (!interfaceDraft) return;
    void runAction(`save-interface-${interfaceId}`, async () => {
      let constraints: Record<string, unknown> | null;
      try {
        constraints = parseConstraints(interfaceDraft.constraintsText);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Invalid interface constraints');
        return;
      }
      await onUpdateInterface(interfaceId, {
        name: interfaceDraft.name.trim() || null,
        interface_type: interfaceDraft.interface_type.trim() || null,
        direction: interfaceDraft.direction || 'unknown',
        description: interfaceDraft.description.trim() || null,
        constraints_json: constraints,
        verification_method: interfaceDraft.verification_method.trim() || null,
        rationale: interfaceDraft.rationale.trim() || null,
      });
      setEditingInterfaceId(null);
      setInterfaceDraft(null);
    });
  };

  const confirmInterface = (item: SubsystemInterfaceSummary) => {
    if (!item.id) return;
    void runAction(`confirm-interface-${item.id}`, () => onConfirmInterface(item.id as string));
  };

  const rejectInterface = (item: SubsystemInterfaceSummary) => {
    if (!item.id) return;
    setConfirmation({
      title: 'Reject interface?',
      description: `This will mark ${item.name || item.interface_type || item.id} as rejected and linked subsystem requirements may need review.`,
      confirmLabel: 'Reject interface',
      onConfirm: () => {
        setConfirmation(null);
        void runAction(`reject-interface-${item.id}`, () => onRejectInterface(item.id as string));
      },
    });
  };

  const startRequirementFromInterface = (item: SubsystemInterfaceSummary) => {
    if (!item.id || !selectedSubsystem) return;
    const evidenceRows = interfaceEvidence[item.id] || [];
    const mappedPartIds = new Set<string>();
    for (const evidence of evidenceRows) {
      const source = evidence.evidence_payload?.source_design_part_id;
      const target = evidence.evidence_payload?.target_design_part_id;
      if (typeof source === 'string') mappedPartIds.add(source);
      if (typeof target === 'string') mappedPartIds.add(target);
    }
    setEditingSubReqId(null);
    setSubReqEditDraft(subReqDraft({
      interface_id: item.id,
      title: item.name || `${item.interface_type || item.signal_type || 'Interface'} requirement`,
      verification_method: item.verification_method || undefined,
      mapped_part_ids: Array.from(mappedPartIds),
    }));
    setCreatingSubReq(true);
    setTab('review');
  };

  const applyReviewProposal = (proposal: SubsystemReviewProposal) => {
    const target = formatProposalTarget(proposal, subsystems, coverage, components);
    const runApply = () => {
      void runAction(`apply-review-proposal-${proposal.id}`, () => onApplyReviewProposal(proposal.id));
    };
    if (CONFIRM_REVIEW_PROPOSAL_TYPES.has(proposal.proposal_type)) {
      setConfirmation({
        title: 'Apply review suggestion?',
        description: `This cannot be undone automatically. ${proposal.title || reviewProposalTypeLabel(proposal.proposal_type)} will apply to ${target}. Linked subsystem requirements may need review.`,
        confirmLabel: 'Apply suggestion',
        onConfirm: () => {
          setConfirmation(null);
          runApply();
        },
      });
      return;
    }
    runApply();
  };

  const dismissReviewProposal = (proposal: SubsystemReviewProposal) => {
    void runAction(`dismiss-review-proposal-${proposal.id}`, () =>
      onDismissReviewProposal(proposal.id, 'dismissed_by_user'));
  };

  const focusBlocker = (blocker: { id: string | null; payload: Record<string, unknown> }) => {
    if (blocker.payload?.design_part_id) {
      setAddPartTarget(String(blocker.payload.design_part_id));
      setTab('review');
      return;
    }
    const subsystemId = String(blocker.payload?.subsystem_id || blocker.id || '');
    if (subsystemId && activeSubsystems.some((subsystem) => subsystem.id === subsystemId)) {
      setSelectedId(subsystemId);
      setTab('review');
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-4">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Subsystem Architecture</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review functional boundaries before generating subsystem requirements.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowCreateSubsystem(true)} disabled={Boolean(busyAction)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Subsystem
            </Button>
            <Button variant="outline" onClick={() => void onRefresh()} disabled={Boolean(busyAction)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => void runAction('regenerate', onRegenerate)} disabled={isGenerating || Boolean(busyAction)}>
              <GitBranch className="mr-2 h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Regenerate'}
            </Button>
            {onGenerateAllSubReqs && (
              <Button
                variant="outline"
                onClick={() => void runAction('gen-all-sub-reqs', () => onGenerateAllSubReqs())}
                disabled={Boolean(isGeneratingSubReqs) || Boolean(busyAction) || !activeSubsystems.some((s) => s.status === 'confirmed')}
                title={
                  activeSubsystems.some((s) => s.status === 'confirmed')
                    ? 'Generate subsystem requirements for all confirmed subsystems'
                    : 'Confirm at least one subsystem first'
                }
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isGeneratingSubReqs ? 'Generating reqs...' : 'Generate Requirements (all)'}
              </Button>
            )}
            {onRegenerateStaleSubReqs && coverage && coverage.counts.stale_subsystem_requirements > 0 && (
              <Button
                variant="outline"
                onClick={() => void runAction('regen-stale-sub-reqs', () => onRegenerateStaleSubReqs())}
                disabled={Boolean(isGeneratingSubReqs) || Boolean(busyAction)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Stale
              </Button>
            )}
            <Button onClick={() => void runAction('complete', onComplete)} disabled={!canComplete || isCompleting || Boolean(busyAction)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isCompleting ? 'Completing...' : 'Complete Subsystem Architecture'}
            </Button>
          </div>
        </header>

        {showCreateSubsystem && (
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-blue-950">Create Manual Subsystem</div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateSubsystem(false)} disabled={Boolean(busyAction)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                value={createDraft.name}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Subsystem name"
              />
              <Input
                value={createDraft.description}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
              />
              <select
                value={createDraft.topology_family}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, topology_family: event.target.value }))}
                className="h-9 rounded-md border border-blue-200 bg-white px-2 text-sm"
              >
                {TOPOLOGY_FAMILY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <Button onClick={createManualSubsystem} disabled={Boolean(busyAction)}>
                Create
              </Button>
            </div>
          </section>
        )}

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

          {coverage && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subsystem Requirement Coverage
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <div><span className="font-semibold">{coverage.counts.covered_design_requirements}</span> covered</div>
                <div className={coverage.counts.uncovered_design_requirements ? 'text-red-700' : 'text-slate-700'}>
                  <span className="font-semibold">{coverage.counts.uncovered_design_requirements}</span> uncovered
                </div>
                <div className={coverage.counts.stale_subsystem_requirements ? 'text-orange-700' : 'text-slate-700'}>
                  <span className="font-semibold">{coverage.counts.stale_subsystem_requirements}</span> stale
                </div>
                <div><span className="font-semibold">{coverage.counts.confirmed_design_requirements}</span> confirmed design reqs</div>
              </div>
            </div>
          )}
        </section>

        <div className="space-y-4">
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
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merge</div>
                  <Badge variant="outline">{selectedMergeIds.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowMerge((value) => !value)}
                  disabled={selectedMergeIds.length < 2 || Boolean(busyAction)}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  Merge selected
                </Button>
                {showMerge && (
                  <div className="mt-3 space-y-2">
                    <select
                      value={mergeTargetId}
                      onChange={(event) => setMergeTargetId(event.target.value)}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="">Create merged subsystem</option>
                      {activeSubsystems
                        .filter((subsystem) => selectedMergeIds.includes(subsystem.id))
                        .map((subsystem) => (
                          <option key={subsystem.id} value={subsystem.id}>Merge into {subsystem.name}</option>
                        ))}
                    </select>
                    <Input
                      value={mergeTargetName}
                      onChange={(event) => setMergeTargetName(event.target.value)}
                      placeholder={mergeTargetId ? 'Optional target rename' : 'New merged subsystem name'}
                      className="h-9 text-sm"
                    />
                    <Button size="sm" className="w-full" onClick={mergeSelectedSubsystems} disabled={Boolean(busyAction)}>
                      Review merge
                    </Button>
                  </div>
                )}
              </div>
              {activeSubsystems.map((subsystem) => (
                <div
                  key={subsystem.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-slate-400 ${
                    subsystem.id === selectedSubsystem?.id ? 'border-slate-900' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setSelectedId(subsystem.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex min-w-0 items-center gap-2">
                        {subsystem.subsystem_key && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {subsystem.subsystem_key}
                          </span>
                        )}
                        <span className="truncate font-semibold text-slate-950">{subsystem.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{subsystem.type}</div>
                    </button>
                    <Badge variant="outline" className={statusTone(subsystem.status)}>
                      {statusLabel(subsystem.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <span>{subsystem.parts?.length || subsystem.componentIds.length} parts</span>
                    <span>{subsystem.requirements?.length || 0} sys reqs</span>
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
                  <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedForMerge[subsystem.id])}
                      onChange={(event) => setSelectedForMerge((prev) => ({
                        ...prev,
                        [subsystem.id]: event.target.checked,
                      }))}
                    />
                    Select for merge
                  </label>
                </div>
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
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {selectedSubsystem.subsystem_key && (
                                  <Badge variant="outline" className="bg-slate-50 text-slate-600">
                                    {selectedSubsystem.subsystem_key}
                                  </Badge>
                                )}
                                <h2 className="text-xl font-semibold text-slate-950">{selectedSubsystem.name}</h2>
                              </div>
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
                        <Button
                          variant="outline"
                          onClick={startSplit}
                          disabled={isEditingSubsystem || (selectedSubsystem.parts || []).length < 2 || Boolean(busyAction)}
                        >
                          <GitBranch className="mr-2 h-4 w-4" />
                          Split
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

                        {selectedSubsystem.evidence && (
                          <div className="rounded-lg border border-slate-200 p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                              <Layers className="h-4 w-4" />
                              Why this grouping?
                            </div>
                            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="font-semibold text-slate-900">{selectedSubsystem.evidence.part_count ?? selectedSubsystem.parts?.length ?? 0}</div>
                                <div>parts</div>
                              </div>
                              <div className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="font-semibold text-slate-900">{selectedSubsystem.evidence.internal_connection_count ?? 0}</div>
                                <div>internal connections</div>
                              </div>
                              <div className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="font-semibold text-slate-900">{selectedSubsystem.evidence.shared_net_count ?? 0}</div>
                                <div>shared nets</div>
                              </div>
                              <div className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="font-semibold text-slate-900">{selectedSubsystem.evidence.requirement_overlap_count ?? 0}</div>
                                <div>mapped requirements</div>
                              </div>
                              <div className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="font-semibold text-slate-900">{selectedSubsystem.evidence.interface_count ?? 0}</div>
                                <div>interfaces</div>
                              </div>
                            </div>
                            {(selectedSubsystem.evidence.functional_roles || []).length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {(selectedSubsystem.evidence.functional_roles || []).slice(0, 6).map((role) => (
                                  <Badge key={role} variant="outline" className="text-[10px]">{role}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

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
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-950">Parts</div>
                            <div className="flex gap-2">
                              <select
                                value={addPartTarget}
                                onChange={(event) => setAddPartTarget(event.target.value)}
                                className="h-8 max-w-[220px] rounded-md border border-slate-300 bg-white px-2 text-xs"
                              >
                                <option value="">Assign part...</option>
                                {assignableParts.map((part) => (
                                  <option key={part.id} value={part.id}>{part.label}</option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!addPartTarget || Boolean(busyAction)}
                                onClick={assignPartToSelected}
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Assign
                              </Button>
                            </div>
                          </div>
                          {showSplit && (
                            <div className="border-b border-blue-100 bg-blue-50 px-4 py-3">
                              <div className="mb-2 text-xs font-semibold text-blue-950">Split into groups</div>
                              <div className="mb-2 grid gap-2 md:grid-cols-2">
                                {[0, 1].map((groupIndex) => (
                                  <Input
                                    key={groupIndex}
                                    value={splitNames[groupIndex]}
                                    onChange={(event) => setSplitNames((prev) => prev.map((name, index) => (
                                      index === groupIndex ? event.target.value : name
                                    )))}
                                    className="h-8 text-xs"
                                    placeholder={`Group ${groupIndex + 1} name`}
                                  />
                                ))}
                              </div>
                              <div className="grid gap-2 md:grid-cols-2">
                                {(selectedSubsystem.parts || []).map((part) => {
                                  const key = partKey(part);
                                  return (
                                    <div key={`split-${key}`} className="flex items-center justify-between gap-2 rounded border border-blue-100 bg-white px-2 py-1.5 text-xs">
                                      <span className="min-w-0 truncate">{partLabel(part)}</span>
                                      <select
                                        value={splitAssignments[key] ?? 0}
                                        onChange={(event) => setSplitAssignments((prev) => ({
                                          ...prev,
                                          [key]: Number(event.target.value),
                                        }))}
                                        className="h-7 rounded border border-slate-300 bg-white px-1 text-xs"
                                      >
                                        <option value={0}>{splitNames[0] || 'Group 1'}</option>
                                        <option value={1}>{splitNames[1] || 'Group 2'}</option>
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setShowSplit(false)} disabled={Boolean(busyAction)}>
                                  Cancel
                                </Button>
                                <Button size="sm" onClick={splitSelectedSubsystem} disabled={Boolean(busyAction)}>
                                  Review split
                                </Button>
                              </div>
                            </div>
                          )}
                          <div className="divide-y divide-slate-100">
                            {(selectedSubsystem.parts || []).map((part: SubsystemPart) => {
                              const key = partKey(part);
                              const target = moveTargets[key] || '';
                              return (
                                <div key={key || partLabel(part)} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_220px_auto_auto] md:items-center">
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
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!key || Boolean(busyAction)}
                                    onClick={() => void runAction(`remove-${key}`, () => onRemovePart(selectedSubsystem.id, key))}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
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
                          <div className="mb-3 text-sm font-semibold text-slate-950">Mapped Design Requirements</div>
                          <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                            Design-level requirements whose source MPNs overlap this subsystem.
                          </div>
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

                        {coverage && (
                          <div className="rounded-lg border border-slate-200 p-4">
                            <div className="mb-3 text-sm font-semibold text-slate-950">Coverage Review</div>
                            <div className="space-y-2">
                              {coverage.uncovered_requirements.slice(0, 4).map((requirement) => (
                                <div key={requirement.req_id} className="rounded border border-red-100 bg-red-50 p-2 text-xs text-red-800">
                                  <div className="font-semibold">{requirement.req_key || requirement.req_id}</div>
                                  <div className="line-clamp-2">{requirement.title || requirement.description}</div>
                                </div>
                              ))}
                              {coverage.stale_subsystem_requirements.slice(0, 4).map((requirement) => (
                                <div key={requirement.req_id} className="rounded border border-orange-100 bg-orange-50 p-2 text-xs text-orange-800">
                                  <div className="font-semibold">{requirement.req_key || requirement.req_id} stale</div>
                                  <div className="line-clamp-2">{requirement.title || requirement.description}</div>
                                </div>
                              ))}
                              {coverage.uncovered_requirements.length === 0 && coverage.stale_subsystem_requirements.length === 0 && (
                                <div className="text-sm text-slate-500">No uncovered or stale requirements.</div>
                              )}
                            </div>
                          </div>
                        )}

                        <SubsystemRequirementsPanel
                          subsystem={selectedSubsystem}
                          isConfirmed={selectedSubsystem.status === 'confirmed'}
                          designRequirements={designRequirements}
                          interfaces={selectedSubsystem.interfaces || []}
                          isGeneratingSubReqs={Boolean(isGeneratingSubReqs)}
                          busyAction={busyAction}
                          editingSubReqId={editingSubReqId}
                          subReqEditDraft={subReqEditDraft}
                          creatingSubReq={creatingSubReq}
                          onStartEdit={(req) => {
                            setEditingSubReqId(req.req_id);
                            setSubReqEditDraft(subReqDraft(req));
                            setCreatingSubReq(false);
                          }}
                          onStartCreate={() => {
                            setEditingSubReqId(null);
                            setSubReqEditDraft(subReqDraft());
                            setCreatingSubReq(true);
                          }}
                          onCancel={() => {
                            setEditingSubReqId(null);
                            setCreatingSubReq(false);
                            setSubReqEditDraft(null);
                          }}
                          onDraftChange={setSubReqEditDraft}
                          onSaveDraft={async () => {
                            if (!subReqEditDraft) return;
                            if (!subReqEditDraft.description.trim()) {
                              toast.error('Description is required');
                              return;
                            }
                            const fields: Partial<SubsystemRequirementItem> = {
                              title: subReqEditDraft.title.trim() || null,
                              description: subReqEditDraft.description.trim(),
                              priority: subReqEditDraft.priority,
                              acceptance_criteria: subReqEditDraft.acceptance_criteria.trim() || null,
                              verification_method: subReqEditDraft.verification_method || null,
                              parent_req_id: subReqEditDraft.parent_req_id || null,
                              interface_id: subReqEditDraft.interface_id || null,
                              mapped_part_ids: subReqEditDraft.mapped_part_ids,
                            };
                            if (creatingSubReq && onCreateSubReq) {
                              await runAction('create-sub-req', () =>
                                onCreateSubReq(selectedSubsystem.id, fields));
                              setCreatingSubReq(false);
                              setSubReqEditDraft(null);
                            } else if (editingSubReqId && onUpdateSubReq) {
                              await runAction(`edit-sub-req-${editingSubReqId}`, () =>
                                onUpdateSubReq(editingSubReqId, fields));
                              setEditingSubReqId(null);
                              setSubReqEditDraft(null);
                            }
                          }}
                          onConfirm={(reqId) =>
                            onConfirmSubReq && runAction(`confirm-sub-req-${reqId}`, () => onConfirmSubReq(reqId))}
                          onReject={(reqId) =>
                            onRejectSubReq && runAction(`reject-sub-req-${reqId}`, () => onRejectSubReq(reqId))}
                          onDelete={(reqId) =>
                            onDeleteSubReq && runAction(`delete-sub-req-${reqId}`, () => onDeleteSubReq(reqId))}
                          onGenerate={() =>
                            onGenerateSubReqs && runAction(`gen-sub-reqs-${selectedSubsystem.id}`, () =>
                              onGenerateSubReqs(selectedSubsystem.id))}
                        />

                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-950">Interfaces</div>
                            <Badge variant="outline">{selectedSubsystem.interfaces?.length || 0}</Badge>
                          </div>
                          <div className="space-y-2">
                            {(selectedSubsystem.interfaces || []).map((item: SubsystemInterfaceSummary) => {
                              const itemType = item.interface_type || item.signal_type || item.primary_type || 'signal';
                              const evidenceRows = item.id ? interfaceEvidence[item.id] || [] : [];
                              const constraintHints = INTERFACE_CONSTRAINT_HINTS[itemType] || [];
                              return (
                                <div key={item.id || `${item.source_subsystem_id}-${item.target_subsystem_id}`} className={`rounded border p-2 ${item.is_stale ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
                                  {editingInterfaceId === item.id && interfaceDraft ? (
                                    <div className="space-y-2">
                                      <Input
                                        value={interfaceDraft.name}
                                        onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, name: event.target.value })}
                                        placeholder="Interface name"
                                        className="h-8 text-xs"
                                      />
                                      <div className="grid grid-cols-2 gap-2">
                                        <select
                                          value={interfaceDraft.interface_type}
                                          onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, interface_type: event.target.value })}
                                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                                        >
                                          {INTERFACE_TYPE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>
                                        <select
                                          value={interfaceDraft.direction}
                                          onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, direction: event.target.value })}
                                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                                        >
                                          {INTERFACE_DIRECTION_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>
                                      </div>
                                      {constraintHints.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {constraintHints.map((hint) => (
                                            <span key={hint} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{hint}</span>
                                          ))}
                                        </div>
                                      )}
                                      <Textarea
                                        value={interfaceDraft.description}
                                        onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, description: event.target.value })}
                                        placeholder="Interface description"
                                        className="min-h-[64px] text-xs"
                                      />
                                      <Textarea
                                        value={interfaceDraft.constraintsText}
                                        onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, constraintsText: event.target.value })}
                                        placeholder='Constraints JSON, e.g. {"voltage_nominal":"5V"}'
                                        className="min-h-[70px] font-mono text-[11px]"
                                      />
                                      <Input
                                        value={interfaceDraft.verification_method}
                                        onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, verification_method: event.target.value })}
                                        placeholder="Verification method"
                                        className="h-8 text-xs"
                                      />
                                      <Textarea
                                        value={interfaceDraft.rationale}
                                        onChange={(event) => setInterfaceDraft((prev) => prev && { ...prev, rationale: event.target.value })}
                                        placeholder="Review rationale"
                                        className="min-h-[56px] text-xs"
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
                                        <div className="min-w-0">
                                          <div className="truncate text-xs font-semibold text-slate-800">
                                            {item.name || item.description || itemType}
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            <Badge variant="outline" className={`text-[10px] ${statusTone(item.status)}`}>{statusLabel(item.status)}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{itemType}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{item.direction || 'unknown'}</Badge>
                                            {item.is_stale && (
                                              <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-800 border-orange-200">stale</Badge>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1">
                                          {item.status !== 'confirmed' && (
                                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => confirmInterface(item)} disabled={!item.id || Boolean(busyAction)}>
                                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                            </Button>
                                          )}
                                          {item.status !== 'rejected' && (
                                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => rejectInterface(item)} disabled={!item.id || Boolean(busyAction)}>
                                              <XCircle className="h-3.5 w-3.5 text-slate-500" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={() => startInterfaceEdit(item)}
                                            disabled={!item.id || Boolean(busyAction)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="mt-1 text-xs text-slate-600">{item.description || 'Subsystem boundary interface contract'}</div>
                                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                                        <span>{item.evidence_count ?? evidenceRows.length} evidence</span>
                                        <span>{item.linked_requirements_count ?? 0} requirements</span>
                                        {item.verification_method && <span>verify: {item.verification_method}</span>}
                                      </div>
                                      {evidenceRows.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {evidenceRows.slice(0, 5).map((evidence) => (
                                            <span key={evidence.id} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                                              {evidence.evidence_type}{evidence.evidence_id ? `:${String(evidence.evidence_id).slice(0, 8)}` : ''}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => item.id && startRequirementFromInterface(item)}
                                          disabled={!item.id || selectedSubsystem.status !== 'confirmed' || Boolean(busyAction)}
                                        >
                                          <Plus className="mr-1 h-3 w-3" />
                                          Requirement
                                        </Button>
                                        {item.id && !interfaceEvidence[item.id] && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => {
                                              if (!item.id) return;
                                              void onLoadInterfaceEvidence(item.id)
                                                .then((rows) => setInterfaceEvidence((prev) => ({ ...prev, [item.id as string]: rows })))
                                                .catch(() => undefined);
                                            }}
                                            disabled={Boolean(busyAction)}
                                          >
                                            Evidence
                                          </Button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
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
                        connections={architectureConnections}
                        subsystemConnections={subsystemConnections}
                      />
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        )}
        {suggestionsAvailable === true && (
          <ReviewProposalsPanel
            proposals={reviewProposals}
            filter={reviewProposalFilter}
            loading={reviewProposalsLoading}
            error={reviewProposalsError}
            isSuggesting={isSuggestingReview}
            busyAction={busyAction}
            subsystems={subsystems}
            coverage={coverage}
            components={components}
            onFilterChange={onReviewProposalFilterChange}
            onSuggest={onSuggestReviewProposals}
            onApply={applyReviewProposal}
            onDismiss={dismissReviewProposal}
          />
        )}
        </div>
      </div>
      {confirmation && (
        <ConfirmActionDialog
          open
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          busy={Boolean(busyAction)}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}

// ── Subsystem Requirements panel ─────────────────────────────────────────────

interface ReviewProposalsPanelProps {
  proposals: SubsystemReviewProposal[];
  filter: SubsystemReviewProposalStatus;
  loading: boolean;
  error: string | null;
  isSuggesting: boolean;
  busyAction: string | null;
  subsystems: Subsystem[];
  coverage: SubsystemRequirementCoverageResponse | null;
  components: Component[];
  onFilterChange: (status: SubsystemReviewProposalStatus) => Promise<void> | void;
  onSuggest: () => Promise<void> | void;
  onApply: (proposal: SubsystemReviewProposal) => void;
  onDismiss: (proposal: SubsystemReviewProposal) => void;
}

function proposalConfidenceLabel(confidence?: number | null): string | null {
  if (typeof confidence !== 'number') return null;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(normalized)}% confidence`;
}

function ReviewProposalsPanel({
  proposals,
  filter,
  loading,
  error,
  isSuggesting,
  busyAction,
  subsystems,
  coverage,
  components,
  onFilterChange,
  onSuggest,
  onApply,
  onDismiss,
}: ReviewProposalsPanelProps) {
  const isPending = filter === 'pending';

  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-950">Review Suggestions</h2>
            {isPending && (
              <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                {proposals.length} pending
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Ask the review agent to propose safe subsystem edits. Applying a proposal always runs server-side validation first.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void onSuggest()}
          disabled={isSuggesting || Boolean(busyAction)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {isSuggesting ? 'Suggesting...' : 'Suggest Improvements'}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {REVIEW_PROPOSAL_FILTERS.map((status) => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => void onFilterChange(status)}
            disabled={loading || Boolean(busyAction)}
            className={filter === status ? '' : 'bg-white'}
          >
            {status[0].toUpperCase() + status.slice(1)}
            {filter === status && proposals.length > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-1.5 text-[10px]">{proposals.length}</span>
            )}
          </Button>
        ))}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            Loading suggestions...
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No {filter} review suggestions.
          </div>
        ) : (
          proposals.map((proposal) => {
            const target = formatProposalTarget(proposal, subsystems, coverage, components);
            const confidence = proposalConfidenceLabel(proposal.confidence);
            const isActionable = proposal.status === 'pending';
            return (
              <article
                key={proposal.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {reviewProposalTypeLabel(proposal.proposal_type)}
                      </Badge>
                      <Badge variant="outline" className={reviewProposalStatusTone(proposal.status)}>
                        {proposal.status}
                      </Badge>
                      {confidence && (
                        <span className="text-xs text-slate-500">{confidence}</span>
                      )}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-slate-950">{proposal.title}</h3>
                    <div className="mt-1 text-xs font-medium text-slate-600">{target}</div>
                    {(proposal.description || proposal.rationale) && (
                      <p className="mt-2 text-sm text-slate-600">
                        {proposal.description || proposal.rationale}
                      </p>
                    )}
                    {proposal.dismissed_reason && (
                      <div className="mt-2 text-xs text-slate-500">
                        Dismissed: {proposal.dismissed_reason}
                      </div>
                    )}
                    {proposal.validation_errors?.length > 0 && (
                      <div className="mt-2 rounded border border-red-100 bg-white px-2 py-1 text-xs text-red-700">
                        {proposal.validation_errors.map((message, index) => (
                          <div key={`${proposal.id}-error-${index}`}>{message}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  {isActionable && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => onApply(proposal)}
                        disabled={Boolean(busyAction)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDismiss(proposal)}
                        disabled={Boolean(busyAction)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

interface SubsystemRequirementsPanelProps {
  subsystem: Subsystem;
  isConfirmed: boolean;
  designRequirements: SubsystemRequirementCoverageResponse['design_requirements'];
  interfaces: SubsystemInterfaceSummary[];
  isGeneratingSubReqs: boolean;
  busyAction: string | null;
  editingSubReqId: string | null;
  subReqEditDraft: SubReqDraft | null;
  creatingSubReq: boolean;
  onStartEdit: (req: SubsystemRequirementItem) => void;
  onStartCreate: () => void;
  onCancel: () => void;
  onDraftChange: (draft: SubReqDraft | null) => void;
  onSaveDraft: () => Promise<void> | void;
  onConfirm: (reqId: string) => Promise<void> | void;
  onReject: (reqId: string) => Promise<void> | void;
  onDelete: (reqId: string) => Promise<void> | void;
  onGenerate: () => Promise<void> | void;
}

function priorityTone(priority?: string | null) {
  if (priority === 'must_have') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === 'should_have') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function reqStatusTone(status?: string | null) {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-gray-100 text-gray-500 border-gray-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function SubsystemRequirementsPanel({
  subsystem,
  isConfirmed,
  designRequirements,
  interfaces,
  isGeneratingSubReqs,
  busyAction,
  editingSubReqId,
  subReqEditDraft,
  creatingSubReq,
  onStartEdit,
  onStartCreate,
  onCancel,
  onDraftChange,
  onSaveDraft,
  onConfirm,
  onReject,
  onDelete,
  onGenerate,
}: SubsystemRequirementsPanelProps) {
  const reqs = (subsystem.subsystem_requirements || []).filter((r) => r.status !== 'rejected');
  const memberParts = subsystem.parts || [];

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-950">Subsystem Requirements</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Requirements scoped to this subsystem
          </div>
        </div>
        <Badge variant="outline">{reqs.length}</Badge>
      </div>

      {!isConfirmed ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
          Confirm this subsystem before generating its requirements.
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void onGenerate()}
            disabled={isGeneratingSubReqs || Boolean(busyAction)}
            title="Generate subsystem requirements via AI"
          >
            <Sparkles className="mr-1.5 h-3 w-3" />
            {isGeneratingSubReqs ? 'Generating...' : reqs.length > 0 ? 'Regenerate' : 'Generate'}
          </Button>
          <Button size="sm" variant="outline" onClick={onStartCreate} disabled={Boolean(busyAction)}>
            <Plus className="mr-1.5 h-3 w-3" />
            Add manually
          </Button>
        </div>
      )}

      {(creatingSubReq || editingSubReqId) && subReqEditDraft && (
        <SubReqEditCard
          draft={subReqEditDraft}
          memberParts={memberParts}
          designRequirements={designRequirements}
          interfaces={interfaces}
          isCreating={creatingSubReq}
          busy={Boolean(busyAction)}
          onChange={onDraftChange}
          onSave={onSaveDraft}
          onCancel={onCancel}
        />
      )}

      <div className="space-y-2">
        {reqs.map((req) => (
          <SubReqRow
            key={req.req_id}
            req={req}
            busy={Boolean(busyAction)}
            editing={editingSubReqId === req.req_id}
            onEdit={() => onStartEdit(req)}
            onConfirm={() => void onConfirm(req.req_id)}
            onReject={() => void onReject(req.req_id)}
            onDelete={() => void onDelete(req.req_id)}
          />
        ))}
        {reqs.length === 0 && !creatingSubReq && (
          <div className="text-xs text-slate-500">
            {isConfirmed
              ? 'No subsystem requirements yet. Generate or add one above.'
              : 'Confirm this subsystem to start generating its requirements.'}
          </div>
        )}
      </div>
    </div>
  );
}

function SubReqRow({
  req, busy, editing, onEdit, onConfirm, onReject, onDelete,
}: {
  req: SubsystemRequirementItem;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return null; // Edit form is rendered above; skip the read-only row while editing.
  }
  return (
    <div className={`rounded border ${req.stale ? 'border-orange-300 bg-orange-50' : 'border-slate-100 bg-slate-50'} p-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800">{req.req_key || 'REQ'}</span>
            <Badge variant="outline" className={`text-[10px] ${reqStatusTone(req.status)}`}>{req.status || 'suggested'}</Badge>
            {req.priority && (
              <Badge variant="outline" className={`text-[10px] ${priorityTone(req.priority)}`}>{req.priority.replace('_', ' ')}</Badge>
            )}
            {req.stale && (
              <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-800 border-orange-200">stale</Badge>
            )}
          </div>
          <div className="mt-1 text-xs font-medium text-slate-900">{req.title || '(untitled)'}</div>
          <div className="mt-0.5 text-xs text-slate-600 line-clamp-3">{req.description}</div>
          {req.parent_req_id && (
            <div className="mt-1 text-[10px] text-blue-700">
              ↳ implements design req: {req.parent_req_key || req.parent_req_id}
              {req.parent_req_title ? ` — ${req.parent_req_title}` : ''}
            </div>
          )}
          {req.interface_id && (
            <div className="mt-1 text-[10px] text-indigo-700">
              linked interface: {req.interface_id}
            </div>
          )}
          {req.acceptance_criteria && (
            <div className="mt-1 text-[10px] text-slate-500">
              <span className="font-semibold">Acceptance:</span> {req.acceptance_criteria}
            </div>
          )}
          {req.verification_method && (
            <div className="mt-0.5 text-[10px] text-slate-500">
              <span className="font-semibold">Verify by:</span> {req.verification_method}
            </div>
          )}
          {(req.quality_warnings || []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(req.quality_warnings || []).map((w) => (
                <span key={w} className="rounded bg-amber-100 px-1 text-[9px] text-amber-800">{w}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {req.status !== 'confirmed' && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onConfirm} disabled={busy} title="Confirm">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          )}
          {req.status !== 'rejected' && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onReject} disabled={busy} title="Reject">
              <XCircle className="h-3.5 w-3.5 text-slate-500" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit} disabled={busy} title="Edit">
            <Pencil className="h-3.5 w-3.5 text-slate-600" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onDelete} disabled={busy} title="Delete">
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubReqEditCard({
  draft, memberParts, designRequirements, interfaces, isCreating, busy, onChange, onSave, onCancel,
}: {
  draft: SubReqDraft;
  memberParts: SubsystemPart[];
  designRequirements: SubsystemRequirementCoverageResponse['design_requirements'];
  interfaces: SubsystemInterfaceSummary[];
  isCreating: boolean;
  busy: boolean;
  onChange: (d: SubReqDraft | null) => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-3">
      <div className="mb-2 text-xs font-semibold text-blue-900">
        {isCreating ? 'New subsystem requirement' : 'Edit subsystem requirement'}
      </div>
      <div className="space-y-2">
        <Input
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Title"
          className="h-8 text-xs"
        />
        <Textarea
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Description (required)"
          className="min-h-[60px] text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={draft.priority}
            onChange={(e) => onChange({ ...draft, priority: e.target.value })}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
          </select>
          <select
            value={draft.verification_method}
            onChange={(e) => onChange({ ...draft, verification_method: e.target.value })}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">verification method</option>
            {VERIFICATION_METHOD_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <Textarea
          value={draft.acceptance_criteria}
          onChange={(e) => onChange({ ...draft, acceptance_criteria: e.target.value })}
          placeholder="Acceptance criteria"
          className="min-h-[50px] text-xs"
        />
        <select
          value={draft.parent_req_id}
          onChange={(e) => onChange({ ...draft, parent_req_id: e.target.value })}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
        >
          <option value="">Parent design requirement...</option>
          {designRequirements.map((requirement) => (
            <option key={requirement.req_id} value={requirement.req_id}>
              {(requirement.req_key || requirement.req_id)} - {requirement.title || requirement.description || 'Requirement'}
            </option>
          ))}
        </select>
        <select
          value={draft.interface_id}
          onChange={(e) => onChange({ ...draft, interface_id: e.target.value })}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
        >
          <option value="">Boundary interface...</option>
          {interfaces.map((item) => (
            <option key={item.id || `${item.source_subsystem_id}-${item.target_subsystem_id}`} value={item.id || ''}>
              {(item.name || item.interface_type || item.signal_type || 'interface')} - {item.direction || 'unknown'}
            </option>
          ))}
        </select>
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">Mapped parts</div>
          <div className="mt-1 max-h-24 overflow-y-auto rounded border border-slate-200 bg-white p-1.5">
            {memberParts.length === 0 ? (
              <div className="text-[11px] text-slate-500">No member parts.</div>
            ) : (
              memberParts.map((p) => {
                const pid = String(p.design_part_id || '');
                const checked = draft.mapped_part_ids.includes(pid);
                return (
                  <label key={pid} className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...draft.mapped_part_ids, pid]
                          : draft.mapped_part_ids.filter((id) => id !== pid);
                        onChange({ ...draft, mapped_part_ids: next });
                      }}
                    />
                    {p.part_number || p.mpn || pid}
                  </label>
                );
              })
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void onSave()} disabled={busy}>
            <Save className="mr-1.5 h-3 w-3" />
            {isCreating ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
