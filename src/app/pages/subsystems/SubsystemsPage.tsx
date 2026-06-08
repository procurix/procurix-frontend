import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import {
  addSubsystemPart,
  applySubsystemReviewProposal,
  completeSubsystemArchitecture,
  confirmSubsystem,
  confirmSubsystemInterface,
  confirmSubsystemRequirement,
  createSubsystem,
  createSubsystemRequirement,
  deleteSubsystemRequirement,
  dismissSubsystemReviewProposal,
  generateAllSubsystemRequirements,
  generateSubsystemRequirements,
  generateSubsystems,
  getSubsystemRequirementCoverage,
  getSubsystemInterfaceEvidence,
  getSubsystemReadiness,
  getSubsystemReviewProposals,
  getSubsystems,
  getConnections,
  mergeSubsystems,
  moveSubsystemPart,
  regenerateStaleSubsystemRequirements,
  removeSubsystemPart,
  rejectSubsystem,
  rejectSubsystemInterface,
  rejectSubsystemRequirement,
  splitSubsystem,
  suggestSubsystemReview,
  updateSubsystem,
  updateSubsystemInterface,
  updateSubsystemRequirement,
  type Connection,
  type SubsystemConnection,
  type SubsystemInterfaceEvidence,
  type SubsystemRequirementCoverageResponse,
  type SubsystemReadinessResponse,
  type SubsystemRequirementItem,
  type SubsystemReviewProposal,
  type SubsystemReviewProposalStatus,
  type SubsystemsResponse,
  type SubsystemSummary,
} from '@/app/services/api';
import type { Component, Subsystem } from '@/app/types';
import { SubsystemsView } from './components/SubsystemsView';

function mapSubsystem(row: SubsystemSummary): Subsystem {
  const partIds = (row.parts || [])
    .map((part) => part.design_part_id)
    .filter((partId): partId is string => Boolean(partId));

  return {
    ...row,
    id: row.subsystem_id || row.id,
    subsystem_id: row.subsystem_id || row.id,
    name: row.name || 'Subsystem',
    type: row.type || row.topology_family || row.topology || 'functional',
    componentIds: partIds.length ? partIds : row.componentIds || row.mpns || row.bom_reference || [],
    parts: row.parts || [],
    requirements: row.requirements || [],
    subsystem_requirements: (row as unknown as { subsystem_requirements?: SubsystemRequirementItem[] }).subsystem_requirements || [],
    subsystem_requirements_count: (row as unknown as { subsystem_requirements_count?: number }).subsystem_requirements_count || 0,
    interfaces: row.interfaces || [],
    mpns: row.mpns || row.bom_reference || [],
  };
}

function componentsFromSubsystems(subsystems: Subsystem[]): Component[] {
  const byId = new Map<string, Component>();
  for (const subsystem of subsystems) {
    for (const part of subsystem.parts || []) {
      const partId = String(part.design_part_id || part.part_number || part.mpn || '');
      const partNumber = String(part.part_number || part.mpn || partId);
      if (!partId || byId.has(partId)) continue;
      byId.set(partId, {
        id: partId,
        reference: String(part.designator || part.component_id || partNumber),
        partNumber,
        manufacturer: part.manufacturer || undefined,
        type: String(part.category || part.classification || 'component'),
        description: String(part.description || partNumber),
        specs: {},
        isIdentified: true,
        isGeneric: false,
        complianceStatus: 'unknown',
      });
    }
  }
  return Array.from(byId.values());
}

function isSubsystemGenerationInProgressError(error: unknown): boolean {
  return error instanceof Error
    && error.message.startsWith('409 ')
    && error.message.includes('Subsystem generation is already running');
}

const subsystemGenerationRequests = new Map<string, Promise<SubsystemsResponse>>();

function generateSubsystemsOnce(designId: string): Promise<SubsystemsResponse> {
  const existing = subsystemGenerationRequests.get(designId);
  if (existing) return existing;

  const request = generateSubsystems(designId).finally(() => {
    subsystemGenerationRequests.delete(designId);
  });
  subsystemGenerationRequests.set(designId, request);
  return request;
}

function hasSubsystemGenerationInFlight(designId: string): boolean {
  return subsystemGenerationRequests.has(designId);
}

export function SubsystemsPage() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, setSessionId, refreshTrigger } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const activeSessionId = querySessionId || contextSessionId;
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [subsystemConnections, setSubsystemConnections] = useState<SubsystemConnection[]>([]);
  const [architectureConnections, setArchitectureConnections] = useState<Connection[]>([]);
  const [readiness, setReadiness] = useState<SubsystemReadinessResponse | null>(null);
  const [coverage, setCoverage] = useState<SubsystemRequirementCoverageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isGeneratingSubReqs, setIsGeneratingSubReqs] = useState(false);
  const [reviewProposals, setReviewProposals] = useState<SubsystemReviewProposal[]>([]);
  const [reviewProposalFilter, setReviewProposalFilter] = useState<SubsystemReviewProposalStatus>('pending');
  const [reviewProposalsLoading, setReviewProposalsLoading] = useState(false);
  const [reviewProposalsError, setReviewProposalsError] = useState<string | null>(null);
  const [suggestionsAvailable, setSuggestionsAvailable] = useState<boolean | null>(null);
  const [isSuggestingReview, setIsSuggestingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  useEffect(() => {
    if (contextSessionId && !querySessionId) {
      updateParams(contextSessionId);
    }
  }, [contextSessionId, querySessionId, updateParams]);

  const refresh = useCallback(async (options?: { generateIfEmpty?: boolean }) => {
    if (!activeSessionId) {
      setError('No session ID available');
      setIsLoading(false);
      return;
    }
    setError(null);
    const response = await getSubsystems(activeSessionId);
    let next = response;
    if (options?.generateIfEmpty && (response.subsystems_count === 0 || response.subsystems.length === 0)) {
      const wasAlreadyGenerating = hasSubsystemGenerationInFlight(activeSessionId);
      setIsGenerating(true);
      try {
        next = await generateSubsystemsOnce(activeSessionId);
        if (wasAlreadyGenerating) {
          toast.info('Subsystem generation is already running.');
        }
      } catch (err) {
        if (!isSubsystemGenerationInProgressError(err)) {
          throw err;
        }
        toast.info('Subsystem generation is already running.');
        next = await getSubsystems(activeSessionId);
      } finally {
        setIsGenerating(false);
      }
    }
    setSubsystems(next.subsystems.map(mapSubsystem));
    setSubsystemConnections(next.connections || []);
    try {
      const connectionResponse = await getConnections(activeSessionId, activeSessionId);
      setArchitectureConnections(connectionResponse.connections || []);
    } catch {
      setArchitectureConnections([]);
    }
    setReadiness(await getSubsystemReadiness(activeSessionId));
    try {
      setCoverage(await getSubsystemRequirementCoverage(activeSessionId));
    } catch {
      setCoverage(null);
    }
  }, [activeSessionId]);

  const loadReviewProposals = useCallback(async (status: SubsystemReviewProposalStatus = 'pending') => {
    if (!activeSessionId) return;
    setReviewProposalsLoading(true);
    setReviewProposalsError(null);
    try {
      const response = await getSubsystemReviewProposals(activeSessionId, status);
      setReviewProposals(response.proposals || []);
      setSuggestionsAvailable(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load review suggestions';
      if (message.startsWith('404 ')) {
        setSuggestionsAvailable(false);
        setReviewProposals([]);
        return;
      }
      setReviewProposalsError(message);
    } finally {
      setReviewProposalsLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      if (!activeSessionId) {
        if (isCurrent) {
          setError('No session ID available');
          setIsLoading(false);
        }
        return;
      }
      try {
        setIsLoading(true);
        if (!querySessionId) updateParams(activeSessionId);
        await refresh({ generateIfEmpty: true });
        await loadReviewProposals('pending');
      } catch (err) {
        if (!isCurrent) return;
        const message = err instanceof Error ? err.message : 'Failed to load subsystem architecture';
        setError(message);
        toast.error(message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    run();
    return () => { isCurrent = false; };
  }, [activeSessionId, querySessionId, loadReviewProposals, refresh, refreshTrigger, updateParams]);

  const handleRegenerate = useCallback(async () => {
    if (!activeSessionId) return;
    const wasAlreadyGenerating = hasSubsystemGenerationInFlight(activeSessionId);
    if (wasAlreadyGenerating) {
      toast.info('Subsystem generation is already running.');
    }
    setIsGenerating(true);
    try {
      const response = await generateSubsystemsOnce(activeSessionId);
      setSubsystems(response.subsystems.map(mapSubsystem));
      setSubsystemConnections(response.connections || []);
      try {
        const connectionResponse = await getConnections(activeSessionId, activeSessionId);
        setArchitectureConnections(connectionResponse.connections || []);
      } catch {
        setArchitectureConnections([]);
      }
      setReadiness(await getSubsystemReadiness(activeSessionId));
      if (!wasAlreadyGenerating) {
        toast.success('Subsystem candidates regenerated.');
      }
    } catch (err) {
      if (isSubsystemGenerationInProgressError(err)) {
        toast.info('Subsystem generation is already running.');
        await refresh();
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate subsystems');
    } finally {
      setIsGenerating(false);
    }
  }, [activeSessionId]);

  const handleConfirm = useCallback(async (subsystemId: string) => {
    if (!activeSessionId) return;
    await confirmSubsystem(activeSessionId, subsystemId);
    await refresh();
    toast.success('Subsystem confirmed.');
  }, [activeSessionId, refresh]);

  const handleReject = useCallback(async (subsystemId: string) => {
    if (!activeSessionId) return;
    await rejectSubsystem(activeSessionId, subsystemId);
    await refresh();
    toast.success('Subsystem rejected.');
  }, [activeSessionId, refresh]);

  const handleMovePart = useCallback(async (designPartId: string, targetSubsystemId: string, sourceSubsystemId?: string) => {
    if (!activeSessionId) return;
    const response = await moveSubsystemPart(activeSessionId, designPartId, targetSubsystemId, sourceSubsystemId);
    setSubsystems(response.subsystems.map(mapSubsystem));
    setSubsystemConnections(response.connections || []);
    try {
      const connectionResponse = await getConnections(activeSessionId, activeSessionId);
      setArchitectureConnections(connectionResponse.connections || []);
    } catch {
      setArchitectureConnections([]);
    }
    setReadiness(await getSubsystemReadiness(activeSessionId));
    toast.success('Part moved.');
  }, [activeSessionId]);

  const handleCreateSubsystem = useCallback(async (payload: {
    name: string;
    description?: string | null;
    topology?: string | null;
    topology_family?: string | null;
  }) => {
    if (!activeSessionId) return;
    await createSubsystem(activeSessionId, payload);
    await refresh();
    toast.success('Subsystem created.');
  }, [activeSessionId, refresh]);

  const handleAddPart = useCallback(async (subsystemId: string, designPartId: string) => {
    if (!activeSessionId) return;
    await addSubsystemPart(activeSessionId, subsystemId, designPartId);
    await refresh();
    toast.success('Part assigned.');
  }, [activeSessionId, refresh]);

  const handleRemovePart = useCallback(async (subsystemId: string, designPartId: string) => {
    if (!activeSessionId) return;
    await removeSubsystemPart(activeSessionId, subsystemId, designPartId);
    await refresh();
    toast.success('Part removed.');
  }, [activeSessionId, refresh]);

  const handleMerge = useCallback(async (payload: {
    source_subsystem_ids: string[];
    target_subsystem_id?: string | null;
    target_name?: string | null;
  }) => {
    if (!activeSessionId) return;
    const response = await mergeSubsystems(activeSessionId, payload);
    setSubsystems(response.subsystems.map(mapSubsystem));
    setSubsystemConnections(response.connections || []);
    try {
      const connectionResponse = await getConnections(activeSessionId, activeSessionId);
      setArchitectureConnections(connectionResponse.connections || []);
    } catch {
      setArchitectureConnections([]);
    }
    setReadiness(await getSubsystemReadiness(activeSessionId));
    setCoverage(await getSubsystemRequirementCoverage(activeSessionId));
    toast.success('Subsystems merged.');
  }, [activeSessionId]);

  const handleSplit = useCallback(async (
    subsystemId: string,
    groups: Array<{ name: string; part_ids: string[] }>,
  ) => {
    if (!activeSessionId) return;
    const response = await splitSubsystem(activeSessionId, subsystemId, { groups });
    setSubsystems(response.subsystems.map(mapSubsystem));
    setSubsystemConnections(response.connections || []);
    try {
      const connectionResponse = await getConnections(activeSessionId, activeSessionId);
      setArchitectureConnections(connectionResponse.connections || []);
    } catch {
      setArchitectureConnections([]);
    }
    setReadiness(await getSubsystemReadiness(activeSessionId));
    setCoverage(await getSubsystemRequirementCoverage(activeSessionId));
    toast.success('Subsystem split.');
  }, [activeSessionId]);

  const handleUpdateSubsystem = useCallback(async (
    subsystemId: string,
    payload: {
      name?: string | null;
      description?: string | null;
      topology?: string | null;
      topology_family?: string | null;
    },
  ) => {
    if (!activeSessionId) return;
    await updateSubsystem(activeSessionId, subsystemId, payload);
    await refresh();
    toast.success('Subsystem updated.');
  }, [activeSessionId, refresh]);

  const handleUpdateInterface = useCallback(async (
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
  ) => {
    if (!activeSessionId) return;
    await updateSubsystemInterface(activeSessionId, interfaceId, payload);
    await refresh();
    toast.success('Interface updated.');
  }, [activeSessionId, refresh]);

  const handleComplete = useCallback(async () => {
    if (!activeSessionId) return;
    setIsCompleting(true);
    try {
      await completeSubsystemArchitecture(activeSessionId);
      toast.success('Subsystem architecture approved.');
      navigate(`/review?session=${activeSessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve subsystem blockers before completing.';
      toast.error(message);
      setReadiness(await getSubsystemReadiness(activeSessionId));
    } finally {
      setIsCompleting(false);
    }
  }, [activeSessionId, navigate]);

  const handleGenerateSubReqs = useCallback(async (subsystemId: string) => {
    if (!activeSessionId) return;
    setIsGeneratingSubReqs(true);
    try {
      await generateSubsystemRequirements(activeSessionId, subsystemId);
      await refresh();
      toast.success('Subsystem requirements generated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate requirements');
    } finally {
      setIsGeneratingSubReqs(false);
    }
  }, [activeSessionId, refresh]);

  const handleGenerateAllSubReqs = useCallback(async () => {
    if (!activeSessionId) return;
    setIsGeneratingSubReqs(true);
    try {
      await generateAllSubsystemRequirements(activeSessionId);
      await refresh();
      toast.success('Subsystem requirements generated for all confirmed subsystems.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate requirements');
    } finally {
      setIsGeneratingSubReqs(false);
    }
  }, [activeSessionId, refresh]);

  const handleConfirmInterface = useCallback(async (interfaceId: string) => {
    if (!activeSessionId) return;
    await confirmSubsystemInterface(activeSessionId, interfaceId);
    await refresh();
    toast.success('Interface confirmed.');
  }, [activeSessionId, refresh]);

  const handleRejectInterface = useCallback(async (interfaceId: string) => {
    if (!activeSessionId) return;
    await rejectSubsystemInterface(activeSessionId, interfaceId);
    await refresh();
    toast.success('Interface rejected.');
  }, [activeSessionId, refresh]);

  const handleLoadInterfaceEvidence = useCallback(async (interfaceId: string): Promise<SubsystemInterfaceEvidence[]> => {
    if (!activeSessionId) return [];
    const response = await getSubsystemInterfaceEvidence(activeSessionId, interfaceId);
    return response.evidence || [];
  }, [activeSessionId]);

  const handleRegenerateStaleSubReqs = useCallback(async () => {
    if (!activeSessionId) return;
    setIsGeneratingSubReqs(true);
    try {
      await regenerateStaleSubsystemRequirements(activeSessionId);
      await refresh();
      toast.success('Stale subsystem requirements regenerated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate stale requirements');
    } finally {
      setIsGeneratingSubReqs(false);
    }
  }, [activeSessionId, refresh]);

  const handleConfirmSubReq = useCallback(async (reqId: string) => {
    if (!activeSessionId) return;
    await confirmSubsystemRequirement(activeSessionId, reqId);
    await refresh();
  }, [activeSessionId, refresh]);

  const handleRejectSubReq = useCallback(async (reqId: string) => {
    if (!activeSessionId) return;
    await rejectSubsystemRequirement(activeSessionId, reqId);
    await refresh();
  }, [activeSessionId, refresh]);

  const handleDeleteSubReq = useCallback(async (reqId: string) => {
    if (!activeSessionId) return;
    await deleteSubsystemRequirement(activeSessionId, reqId);
    await refresh();
  }, [activeSessionId, refresh]);

  const handleUpdateSubReq = useCallback(async (reqId: string, fields: Partial<SubsystemRequirementItem>) => {
    if (!activeSessionId) return;
    await updateSubsystemRequirement(activeSessionId, reqId, fields);
    await refresh();
  }, [activeSessionId, refresh]);

  const handleReviewProposalFilterChange = useCallback(async (status: SubsystemReviewProposalStatus) => {
    setReviewProposalFilter(status);
    await loadReviewProposals(status);
  }, [loadReviewProposals]);

  const handleSuggestReviewProposals = useCallback(async () => {
    if (!activeSessionId) return;
    setIsSuggestingReview(true);
    setReviewProposalsError(null);
    try {
      const response = await suggestSubsystemReview(activeSessionId);
      setReviewProposals(response.proposals || []);
      setReviewProposalFilter('pending');
      setSuggestionsAvailable(true);
      toast.success(response.count ? `Created ${response.count} review suggestion${response.count === 1 ? '' : 's'}.` : 'No new review suggestions.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to suggest improvements';
      if (message.startsWith('404 ')) {
        setSuggestionsAvailable(false);
        toast.info('Review suggestions are not enabled for this environment.');
        return;
      }
      setReviewProposalsError(message);
      toast.error(message);
    } finally {
      setIsSuggestingReview(false);
    }
  }, [activeSessionId]);

  const handleApplyReviewProposal = useCallback(async (proposalId: string) => {
    if (!activeSessionId) return;
    try {
      const response = await applySubsystemReviewProposal(activeSessionId, proposalId);
      setReviewProposals((prev) => prev.map((proposal) => (
        proposal.id === response.proposal.id ? response.proposal : proposal
      )));
      setReadiness(response.readiness);
      await refresh();
      try {
        setCoverage(await getSubsystemRequirementCoverage(activeSessionId));
      } catch {
        setCoverage(null);
      }
      await loadReviewProposals(reviewProposalFilter);
      toast.success('Review suggestion applied.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply review suggestion';
      if (message.startsWith('409 ')) {
        await loadReviewProposals(reviewProposalFilter);
      }
      toast.error(message);
    }
  }, [activeSessionId, loadReviewProposals, refresh, reviewProposalFilter]);

  const handleDismissReviewProposal = useCallback(async (proposalId: string, reason?: string) => {
    if (!activeSessionId) return;
    try {
      const response = await dismissSubsystemReviewProposal(activeSessionId, proposalId, reason);
      setReviewProposals((prev) => prev.map((proposal) => (
        proposal.id === response.proposal.id ? response.proposal : proposal
      )));
      await loadReviewProposals(reviewProposalFilter);
      toast.success('Review suggestion dismissed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dismiss review suggestion');
    }
  }, [activeSessionId, loadReviewProposals, reviewProposalFilter]);

  const handleCreateSubReq = useCallback(async (subsystemId: string, fields: Partial<SubsystemRequirementItem>) => {
    if (!activeSessionId) return;
    await createSubsystemRequirement(activeSessionId, subsystemId, fields);
    await refresh();
  }, [activeSessionId, refresh]);

  const components = useMemo(() => componentsFromSubsystems(subsystems), [subsystems]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600">Loading subsystem architecture...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error}</p>
          <button
            onClick={() => void refresh({ generateIfEmpty: true })}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <SubsystemsView
      subsystems={subsystems}
      components={components}
      subsystemConnections={subsystemConnections}
      architectureConnections={architectureConnections}
      readiness={readiness}
      coverage={coverage}
      reviewProposals={reviewProposals}
      reviewProposalFilter={reviewProposalFilter}
      reviewProposalsLoading={reviewProposalsLoading}
      reviewProposalsError={reviewProposalsError}
      suggestionsAvailable={suggestionsAvailable}
      isSuggestingReview={isSuggestingReview}
      isGenerating={isGenerating}
      isCompleting={isCompleting}
      onRefresh={() => refresh()}
      onRegenerate={handleRegenerate}
      onReviewProposalFilterChange={handleReviewProposalFilterChange}
      onSuggestReviewProposals={handleSuggestReviewProposals}
      onApplyReviewProposal={handleApplyReviewProposal}
      onDismissReviewProposal={handleDismissReviewProposal}
      onConfirm={handleConfirm}
      onReject={handleReject}
      onCreateSubsystem={handleCreateSubsystem}
      onAddPart={handleAddPart}
      onRemovePart={handleRemovePart}
      onMovePart={handleMovePart}
      onMergeSubsystems={handleMerge}
      onSplitSubsystem={handleSplit}
      onUpdateSubsystem={handleUpdateSubsystem}
      onUpdateInterface={handleUpdateInterface}
      onConfirmInterface={handleConfirmInterface}
      onRejectInterface={handleRejectInterface}
      onLoadInterfaceEvidence={handleLoadInterfaceEvidence}
      onComplete={handleComplete}
      onGenerateSubReqs={handleGenerateSubReqs}
      onGenerateAllSubReqs={handleGenerateAllSubReqs}
      onRegenerateStaleSubReqs={handleRegenerateStaleSubReqs}
      onConfirmSubReq={handleConfirmSubReq}
      onRejectSubReq={handleRejectSubReq}
      onDeleteSubReq={handleDeleteSubReq}
      onUpdateSubReq={handleUpdateSubReq}
      onCreateSubReq={handleCreateSubReq}
      isGeneratingSubReqs={isGeneratingSubReqs}
    />
  );
}
