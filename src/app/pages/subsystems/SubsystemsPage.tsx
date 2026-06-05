import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import {
  completeSubsystemArchitecture,
  confirmSubsystem,
  confirmSubsystemRequirement,
  createSubsystemRequirement,
  deleteSubsystemRequirement,
  generateAllSubsystemRequirements,
  generateSubsystemRequirements,
  generateSubsystems,
  getSubsystemReadiness,
  getSubsystems,
  moveSubsystemPart,
  rejectSubsystem,
  rejectSubsystemRequirement,
  updateSubsystem,
  updateSubsystemInterface,
  updateSubsystemRequirement,
  type SubsystemConnection,
  type SubsystemReadinessResponse,
  type SubsystemRequirementItem,
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

export function SubsystemsPage() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, setSessionId, refreshTrigger } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const activeSessionId = querySessionId || contextSessionId;
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [subsystemConnections, setSubsystemConnections] = useState<SubsystemConnection[]>([]);
  const [readiness, setReadiness] = useState<SubsystemReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isGeneratingSubReqs, setIsGeneratingSubReqs] = useState(false);
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
      setIsGenerating(true);
      try {
        next = await generateSubsystems(activeSessionId);
      } finally {
        setIsGenerating(false);
      }
    }
    setSubsystems(next.subsystems.map(mapSubsystem));
    setSubsystemConnections(next.connections || []);
    setReadiness(await getSubsystemReadiness(activeSessionId));
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
  }, [activeSessionId, querySessionId, refresh, refreshTrigger, updateParams]);

  const handleRegenerate = useCallback(async () => {
    if (!activeSessionId) return;
    setIsGenerating(true);
    try {
      const response = await generateSubsystems(activeSessionId);
      setSubsystems(response.subsystems.map(mapSubsystem));
      setSubsystemConnections(response.connections || []);
      setReadiness(await getSubsystemReadiness(activeSessionId));
      toast.success('Subsystem candidates regenerated.');
    } catch (err) {
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
    setReadiness(await getSubsystemReadiness(activeSessionId));
    toast.success('Part moved.');
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
    payload: { signal_type?: string | null; description?: string | null },
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
      readiness={readiness}
      isGenerating={isGenerating}
      isCompleting={isCompleting}
      onRefresh={() => refresh()}
      onRegenerate={handleRegenerate}
      onConfirm={handleConfirm}
      onReject={handleReject}
      onMovePart={handleMovePart}
      onUpdateSubsystem={handleUpdateSubsystem}
      onUpdateInterface={handleUpdateInterface}
      onComplete={handleComplete}
      onGenerateSubReqs={handleGenerateSubReqs}
      onGenerateAllSubReqs={handleGenerateAllSubReqs}
      onConfirmSubReq={handleConfirmSubReq}
      onRejectSubReq={handleRejectSubReq}
      onDeleteSubReq={handleDeleteSubReq}
      onUpdateSubReq={handleUpdateSubReq}
      onCreateSubReq={handleCreateSubReq}
      isGeneratingSubReqs={isGeneratingSubReqs}
    />
  );
}
