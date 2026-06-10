import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  applyRequirementProposal,
  confirmAllRequirements,
  confirmRequirement,
  createRequirement,
  deleteRequirement,
  getPartSpecs,
  getRequirementDetail,
  proposeRequirementEdit,
  rejectRequirement,
  updateRequirement,
  type PartSpecEvidence,
  type Requirement as APIRequirement,
  type RequirementHistoryEvent,
  type RequirementProposal,
} from '@/app/services/api';
import type { DraftRequirement, RequirementReviewBlocker, ReviewFilter } from '../types';
import { normalizeRequirementForUi } from '../utils';
import { ImpactCancelledError, useImpactPreview } from '@/app/context/impactPreview';

interface UseRequirementActionsArgs {
  sessionId?: string | null;
  selectedRequirement: APIRequirement | null;
  setRequirements: Dispatch<SetStateAction<APIRequirement[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setCurrentStage: (stage: number | null) => void;
  reloadRequirements: () => Promise<APIRequirement[]>;
  upsertRequirement: (req: APIRequirement) => void;
  reviewBlockers: RequirementReviewBlocker[];
  setReviewFilter: Dispatch<SetStateAction<ReviewFilter>>;
  onRequirementsComplete: () => void;
}

export function useRequirementActions({
  sessionId,
  selectedRequirement,
  setRequirements,
  setSelectedId,
  setCurrentStage,
  reloadRequirements,
  upsertRequirement,
  reviewBlockers,
  setReviewFilter,
  onRequirementsComplete,
}: UseRequirementActionsArgs) {
  // setReviewFilter is currently unused after the force-confirm change.
  // Keep it in the contract — page callers still pass it — but explicitly mark
  // unused so the TS lint stays quiet.
  void setReviewFilter;
  const { withImpactPreview } = useImpactPreview();
  const [savingRequirementId, setSavingRequirementId] = useState<string | null>(null);
  const [traceMpn, setTraceMpn] = useState<string | null>(null);
  const [partSpecs, setPartSpecs] = useState<Record<string, PartSpecEvidence>>({});
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [proposal, setProposal] = useState<RequirementProposal | null>(null);
  const [proposingAction, setProposingAction] = useState<string | null>(null);
  const [rejectingRequirement, setRejectingRequirement] = useState<APIRequirement | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [historyByRequirement, setHistoryByRequirement] = useState<Record<string, RequirementHistoryEvent[]>>({});

  useEffect(() => {
    if (!sessionId || !selectedRequirement || historyByRequirement[selectedRequirement.req_id]) return;

    let isCurrent = true;
    getRequirementDetail(sessionId, selectedRequirement.req_id)
      .then(detail => {
        if (!isCurrent) return;
        setHistoryByRequirement(prev => ({
          ...prev,
          [selectedRequirement.req_id]: detail.history ?? [],
        }));
      })
      .catch(() => {
        if (!isCurrent) return;
        setHistoryByRequirement(prev => ({ ...prev, [selectedRequirement.req_id]: [] }));
      });

    return () => { isCurrent = false; };
  }, [sessionId, selectedRequirement, historyByRequirement]);

  const clearRequirementHistory = (reqId: string) => {
    setHistoryByRequirement(prev => {
      const next = { ...prev };
      delete next[reqId];
      return next;
    });
  };

  const handleApprove = async (req: APIRequirement) => {
    if (!sessionId) return;
    setSavingRequirementId(req.req_id);
    try {
      const result = await confirmRequirement(sessionId, req.req_id);
      upsertRequirement(result.requirement);
      clearRequirementHistory(req.req_id);
      toast.success('Requirement approved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve requirement');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const handleReject = async (req: APIRequirement, reason: string) => {
    if (!sessionId) return;
    if (!reason.trim()) {
      toast.error('A reject reason is required');
      return;
    }
    setSavingRequirementId(req.req_id);
    try {
      const result = await withImpactPreview<{ children_deleted?: number; children_flagged?: number } | null>({
        action: 'reject_requirement',
        target: { id: req.req_id },
        designId: sessionId,
        verb: `Reject ${req.req_key || req.req_id}`,
        apply: async () => {
          const r = await rejectRequirement(sessionId, req.req_id, reason.trim()) as { cascade?: { children_deleted?: number; children_flagged?: number } };
          return r.cascade || null;
        },
      });
      setRequirements(prev => prev.filter(item => item.req_id !== req.req_id));
      setSelectedId(prev => prev === req.req_id ? null : prev);
      setRejectingRequirement(null);
      setRejectReason('');
      const cascadeMsg = result && ((result.children_deleted || 0) + (result.children_flagged || 0) > 0)
        ? ` (${result.children_deleted || 0} child reqs deleted, ${result.children_flagged || 0} flagged)`
        : '';
      toast.success(`Requirement rejected${cascadeMsg}`);
    } catch (error) {
      if (error instanceof ImpactCancelledError) return;
      toast.error(error instanceof Error ? error.message : 'Failed to reject requirement');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const handleDelete = async (req: APIRequirement) => {
    if (!sessionId) return;
    setSavingRequirementId(req.req_id);
    try {
      const result = await withImpactPreview<{ children_deleted?: number; children_flagged?: number } | null>({
        action: 'delete_requirement',
        target: { id: req.req_id },
        designId: sessionId,
        verb: `Delete ${req.req_key || req.req_id}`,
        apply: async () => {
          const r = await deleteRequirement(sessionId, req.req_id) as { cascade?: { children_deleted?: number; children_flagged?: number } };
          return r.cascade || null;
        },
      });
      setRequirements(prev => prev.filter(item => item.req_id !== req.req_id));
      setSelectedId(prev => prev === req.req_id ? null : prev);
      const cascadeMsg = result && ((result.children_deleted || 0) + (result.children_flagged || 0) > 0)
        ? ` (${result.children_deleted || 0} child reqs deleted, ${result.children_flagged || 0} flagged)`
        : '';
      toast.success(`Requirement deleted${cascadeMsg}`);
    } catch (error) {
      if (error instanceof ImpactCancelledError) return;
      toast.error(error instanceof Error ? error.message : 'Failed to delete requirement');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const handleSave = async (reqId: string, data: Partial<APIRequirement>) => {
    if (!sessionId) return;
    setSavingRequirementId(reqId);
    try {
      const result = await withImpactPreview<Awaited<ReturnType<typeof updateRequirement>>>({
        action: 'patch_requirement',
        target: { id: reqId, patch: data },
        designId: sessionId,
        verb: `Save edit to ${reqId}`,
        apply: () => updateRequirement(sessionId, reqId, data, undefined, undefined, setCurrentStage),
      });
      upsertRequirement(result.requirement);
      clearRequirementHistory(reqId);
      toast.success('Requirement updated');
    } catch (error) {
      if (error instanceof ImpactCancelledError) return;
      toast.error(error instanceof Error ? error.message : 'Failed to update requirement');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const handleCreateRequirement = async (
    draft: DraftRequirement,
    selectedSourceParts: string[],
    onCreated: () => void,
  ) => {
    if (!sessionId) return;
    if (!draft.title.trim() || !draft.description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    try {
      const result = await createRequirement(sessionId, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        specification: draft.specification.trim(),
        category: draft.category,
        priority: draft.priority,
        verification_method: draft.verification_method || undefined,
        acceptance_criteria: draft.acceptance_criteria || undefined,
        source_mpns: selectedSourceParts,
      });
      const normalized = normalizeRequirementForUi(result.requirement);
      setRequirements(prev => [...prev, normalized]);
      setSelectedId(normalized.req_id);
      onCreated();
      toast.success('Requirement created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create requirement');
    }
  };

  const openTraceability = async (mpn: string) => {
    if (!sessionId) return;
    setTraceMpn(mpn);
    if (partSpecs[mpn]) return;
    setLoadingTrace(true);
    try {
      const specs = await getPartSpecs(sessionId);
      setPartSpecs(specs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load traceability evidence');
    } finally {
      setLoadingTrace(false);
    }
  };

  const handleAiAction = async (action: string) => {
    if (!sessionId || !selectedRequirement) return;
    setProposingAction(action);
    setProposal(null);
    try {
      const nextProposal = await proposeRequirementEdit(sessionId, selectedRequirement.req_id, action);
      setProposal(nextProposal);
      toast.success('AI proposal ready for review');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create AI proposal');
    } finally {
      setProposingAction(null);
    }
  };

  const handleApplyProposal = async () => {
    if (!sessionId || !proposal) return;
    try {
      await applyRequirementProposal(sessionId, proposal.id);
      setProposal(null);
      await reloadRequirements();
      toast.success('Proposal applied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply proposal');
    }
  };

  const handleContinue = async () => {
    if (!sessionId) {
      toast.error('No session found');
      return;
    }
    // Force-confirm: bypass the must-have quality gate. The AI-generated
    // fields are often incomplete (missing verification_method, acceptance
    // criteria, or traceability) but the user has already reviewed them and
    // wants to proceed. The gate stays available on the backend by default;
    // we just don't use it from this button.
    try {
      await confirmAllRequirements(sessionId, { force: true });
      if (reviewBlockers.length > 0) {
        toast.warning(
          `Confirmed all requirements (${reviewBlockers.length} still flagged for review — fix later if needed)`,
        );
      } else {
        toast.success('All requirements confirmed');
      }
      onRequirementsComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm requirements');
    }
  };

  return {
    savingRequirementId,
    traceMpn,
    setTraceMpn,
    partSpecs,
    loadingTrace,
    proposal,
    setProposal,
    proposingAction,
    rejectingRequirement,
    setRejectingRequirement,
    rejectReason,
    setRejectReason,
    historyByRequirement,
    handleApprove,
    handleReject,
    handleDelete,
    handleSave,
    handleCreateRequirement,
    openTraceability,
    handleAiAction,
    handleApplyProposal,
    handleContinue,
  };
}
