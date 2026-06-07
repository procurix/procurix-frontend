import { useState, useEffect, useCallback } from 'react';
import { SystemArchitectureView, type ComponentBlock } from './components/SystemArchitectureView';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { analyzeConnections, confirmAllConnections, getArchitectureCompletionReadiness, getArchitectureProposals, getConnectionReviewStatus, getConnections, getClassification, getNets, getPartPinout, getPartPinouts, getPartSpecs, getSubsystemReadiness, getSubsystems, resolveConnectionPins, saveConnections, updateCurrentStageInContext, type ArchitectureCompletionReadiness, type ArchitectureNet, type ConnectionsResponse, type PartPinoutResponse, type SubsystemSummary } from '@/app/services/api';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';
import type { Component, PartPin } from '@/app/types';
import {
  buildArchitectureComponents,
  buildSaveConnectionPayload,
  mapApiConnections,
  mapUnresolvedProposalConnections,
  type ArchitectureConnectionData,
  type ArchitectureUnresolvedConnectionCandidate,
} from './utils/connectionMapping';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isHttpConflict(error: unknown): boolean {
  return errorMessage(error).includes('409');
}

function isHttpNotFound(error: unknown): boolean {
  return errorMessage(error).includes('404');
}

function attachNetIdsToConnections(response: ConnectionsResponse, nets: ArchitectureNet[]): ConnectionsResponse {
  const netIdByConnectionId = new Map<string, string>();
  for (const net of nets) {
    for (const connectionId of net.member_connection_ids || []) {
      netIdByConnectionId.set(connectionId, net.id);
    }
    for (const member of net.members || []) {
      if (member.id) netIdByConnectionId.set(member.id, net.id);
    }
  }

  return {
    ...response,
    connections: (response.connections || []).map((connection) => ({
      ...connection,
      net_id: connection.net_id ?? (connection.id ? netIdByConnectionId.get(connection.id) : undefined) ?? null,
    })),
  };
}

const SUBSYSTEM_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626'];

function subsystemAnnotations(subsystems: SubsystemSummary[]): Record<string, {
  subsystemId: string;
  subsystemName: string;
  subsystemKey?: string | null;
  subsystemColor: string;
}> {
  const annotations: Record<string, {
    subsystemId: string;
    subsystemName: string;
    subsystemKey?: string | null;
    subsystemColor: string;
  }> = {};
  subsystems
    .filter((subsystem) => subsystem.status !== 'rejected')
    .forEach((subsystem, index) => {
      const color = SUBSYSTEM_COLORS[index % SUBSYSTEM_COLORS.length];
      for (const part of subsystem.parts || []) {
        const ids = [
          part.design_part_id,
          part.mpn,
          part.part_number,
        ].filter((value): value is string => Boolean(value));
        for (const id of ids) {
          annotations[id] = {
            subsystemId: subsystem.subsystem_id || subsystem.id,
            subsystemName: subsystem.name,
            subsystemKey: subsystem.subsystem_key || subsystem.original_subsystem_id,
            subsystemColor: color,
          };
        }
      }
    });
  return annotations;
}

function toArchitecturePinout(pins: PartPin[] | null | undefined): Record<string, { name: string; type: string; description: string }> {
  const pinout: Record<string, { name: string; type: string; description: string }> = {};
  for (const pin of pins || []) {
    const number = String(pin.number ?? '');
    const name = String(pin.name ?? '').trim();
    if (!number || !name) continue;
    pinout[number] = {
      name,
      type: String(pin.direction ?? 'bidirectional').toUpperCase(),
      description: String(pin.function ?? pin.notes ?? ''),
    };
  }
  return pinout;
}

export function ArchitecturePage() {
  const { sessionId: contextSessionId, setSessionId, setCurrentStage, refreshTrigger } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const { activeSessionId, navigateToStage } = useWorkflowNavigation();
  const [components, setComponents] = useState<Component[]>([]);
  const [connections, setConnections] = useState<ArchitectureConnectionData[]>([]);
  const [unresolvedConnections, setUnresolvedConnections] = useState<ArchitectureUnresolvedConnectionCandidate[]>([]);
  const [nets, setNets] = useState<ArchitectureNet[]>([]);
  const [completionReadiness, setCompletionReadiness] = useState<ArchitectureCompletionReadiness | null>(null);
  const [classificationMap, setClassificationMap] = useState<Record<string, string>>({});
  const [showSubsystemOverlay, setShowSubsystemOverlay] = useState(false);
  const [subsystemOverlay, setSubsystemOverlay] = useState<Record<string, {
    subsystemId: string;
    subsystemName: string;
    subsystemKey?: string | null;
    subsystemColor: string;
    subsystemWarning?: boolean;
  }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Temporal workflow ID returned when USE_TEMPORAL=true — needed to send the confirm signal
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Sync session ID from query params
  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  const refreshCompletionReadiness = useCallback(async (): Promise<ArchitectureCompletionReadiness | null> => {
    if (!activeSessionId) {
      setCompletionReadiness(null);
      return null;
    }
    const readiness = await getArchitectureCompletionReadiness(activeSessionId);
    setCompletionReadiness(readiness);
    return readiness;
  }, [activeSessionId]);

  useEffect(() => {
    let isCurrent = true;

    const fetchConnections = async () => {
      if (!activeSessionId) {
        if (isCurrent) { setError('No session ID available'); setCompletionReadiness(null); setIsLoading(false); }
        return;
      }

      try {
        if (isCurrent) { setIsLoading(true); setError(null); }
        if (!querySessionId) updateParams(activeSessionId);

        // GET first — only POST (generate) if truly empty
        let response: ConnectionsResponse;
        try {
          response = await getConnections(activeSessionId, activeSessionId);

          if (!response.connections || response.connections.length === 0) {
            if (!isCurrent) return;
            try {
              response = await analyzeConnections(activeSessionId);
              if (isCurrent && response.workflow_id) setWorkflowId(response.workflow_id);
            } catch (postError: unknown) {
              // 409 = another concurrent call is already generating — re-fetch
              if (isHttpConflict(postError)) {
                response = await getConnections(activeSessionId, activeSessionId);
              } else {
                throw postError;
              }
            }
          }
        } catch (getError: unknown) {
          if (isHttpNotFound(getError)) {
            if (!isCurrent) return;
            try {
              response = await analyzeConnections(activeSessionId);
              if (isCurrent && response.workflow_id) setWorkflowId(response.workflow_id);
            } catch (postError: unknown) {
              if (isHttpConflict(postError)) {
                response = await getConnections(activeSessionId, activeSessionId);
              } else {
                throw postError;
              }
            }
          } else {
            throw getError;
          }
        }

        if (!isCurrent) return;

        const needsPinResolution = response.connections?.some((conn) => {
          const hasNoPins = !conn.source_pin && !conn.target_pin;
          const wasSavedBeforePinResolution = conn.pin_resolution_source === 'manual' && hasNoPins;
          return !conn.user_corrected
            && hasNoPins
            && (!conn.pin_resolution_source || wasSavedBeforePinResolution);
        });
        if (needsPinResolution) {
          try {
            response = await resolveConnectionPins(activeSessionId);
          } catch {
            // Non-fatal: diagram still renders component-level connections.
          }
        }

        let persistedNets: ArchitectureNet[] = [];
        try {
          const netsResponse = await getNets(activeSessionId);
          persistedNets = netsResponse.nets || [];
          response = attachNetIdsToConnections(response, persistedNets);
        } catch (netError) {
          console.warn('Could not load persisted architecture nets; using generated net fallback.', netError);
        }

        // Fetch all classified parts so isolated (unconnected) parts still appear
        let specsMap: Record<string, Record<string, unknown>> = {};
        let displayedPartNumbers: string[] = [];
        let pinoutMap: Record<string, Record<string, { name: string; type: string; description: string }>> = {};
        try {
          const [cls, specs] = await Promise.all([
            getClassification(activeSessionId),
            getPartSpecs(activeSessionId),
          ]);
          specsMap = specs;
          if (isCurrent) {
            const nonNullClassificationMap = Object.fromEntries(
              Object.entries(cls.classification_map || {}).filter((entry): entry is [string, string] => entry[1] !== null),
            );
            // Pass all classified parts so the All/Fundamental toggle has full data.
            // SystemArchitectureView defaults to 'fundamental' mode; the toggle
            // uses classificationMap to decide which nodes to show.
            displayedPartNumbers = Object.keys(nonNullClassificationMap);
            setClassificationMap(nonNullClassificationMap);
          }
          try {
            const batchPinouts = await getPartPinouts(activeSessionId, displayedPartNumbers);
            pinoutMap = Object.fromEntries(
              Object.entries(batchPinouts.pinouts || {}).map(([mpn, pinout]) => [mpn, toArchitecturePinout(pinout.pins)]),
            );
          } catch {
            const pinoutResults = await Promise.allSettled(
              displayedPartNumbers.map(async (mpn) => [mpn, await getPartPinout(activeSessionId, mpn)] as const),
            );
            pinoutMap = Object.fromEntries(
              pinoutResults
                .filter((result): result is PromiseFulfilledResult<readonly [string, PartPinoutResponse]> => result.status === 'fulfilled')
                .map((result) => [result.value[0], toArchitecturePinout(result.value[1].pins)]),
            );
          }
        } catch {
          // fallback: derive from connections only
        }
        if (!isCurrent) return;

        let pendingProposals: ArchitectureUnresolvedConnectionCandidate[] = [];
        try {
          const proposalResponse = await getArchitectureProposals(activeSessionId, 'pending');
          pendingProposals = mapUnresolvedProposalConnections(proposalResponse.proposals || []);
        } catch (proposalError) {
          console.warn('Could not load unresolved architecture proposals.', proposalError);
        }

        let overlay: Record<string, {
          subsystemId: string;
          subsystemName: string;
          subsystemKey?: string | null;
          subsystemColor: string;
          subsystemWarning?: boolean;
        }> = {};
        try {
          const subsystemResponse = await getSubsystems(activeSessionId);
          overlay = subsystemAnnotations(subsystemResponse.subsystems || []);
          try {
            const subsystemReadiness = await getSubsystemReadiness(activeSessionId);
            for (const blocker of subsystemReadiness.blockers || []) {
              if (blocker.type !== 'unassigned_important_part') continue;
              const warningKeys = [
                blocker.id,
                blocker.payload?.design_part_id,
                blocker.payload?.mpn,
              ].filter((value): value is string => typeof value === 'string' && Boolean(value));
              for (const key of warningKeys) {
                overlay[key] = {
                  subsystemId: '',
                  subsystemName: 'Unassigned',
                  subsystemKey: 'Unassigned',
                  subsystemColor: '#f59e0b',
                  subsystemWarning: true,
                };
              }
            }
          } catch {
            // Subsystem readiness is only available after subsystem architecture exists.
          }
        } catch {
          overlay = {};
        }

        const componentsList = buildArchitectureComponents(response.connections, displayedPartNumbers, specsMap, pinoutMap);
        const annotatedComponents = componentsList.map((component) => {
          const annotation = overlay[component.id] || (component.partNumber ? overlay[component.partNumber] : undefined);
          return annotation ? { ...component, ...annotation } : component;
        });
        const mappedConnections = mapApiConnections(response.connections);
        const mappedUnresolvedConnections = pendingProposals;

        setComponents(annotatedComponents);
        setSubsystemOverlay(overlay);
        setConnections(mappedConnections);
        setUnresolvedConnections(mappedUnresolvedConnections);
        setNets(persistedNets);
        try {
          const readiness = await getArchitectureCompletionReadiness(activeSessionId);
          if (isCurrent) setCompletionReadiness(readiness);
        } catch (readinessError) {
          console.warn('Could not load architecture completion readiness.', readinessError);
          if (isCurrent) setCompletionReadiness(null);
        }
        setIsLoading(false);

        // Hydrate workflowId after a page refresh — the review-status endpoint
        // queries the Temporal workflow (deterministic ID) to check if it is
        // still waiting at the connections_review HITL gate.
        getConnectionReviewStatus(activeSessionId)
          .then(rs => {
            if (isCurrent && rs.pending_review && rs.workflow_id) {
              setWorkflowId((current) => current ?? rs.workflow_id);
            }
          })
          .catch(() => { /* non-fatal: USE_TEMPORAL=false or workflow already done */ });
      } catch (err) {
        if (!isCurrent) return;
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch connections';
        setError(errorMessage);
        setCompletionReadiness(null);
        toast.error(errorMessage);
        setIsLoading(false);
      }
    };

    fetchConnections();
    return () => { isCurrent = false; };
  }, [activeSessionId, querySessionId, updateParams, refreshTrigger]);

  const refreshNets = useCallback(async (): Promise<ArchitectureNet[]> => {
    if (!activeSessionId) return [];
    const netsResponse = await getNets(activeSessionId);
    const nextNets = netsResponse.nets || [];
    setNets(nextNets);
    void refreshCompletionReadiness();
    return nextNets;
  }, [activeSessionId, refreshCompletionReadiness]);

  const handleArchitectureComplete = async (
    _blocks: ComponentBlock[],
    updatedConnections: ArchitectureConnectionData[],
  ) => {
    if (!activeSessionId) return;

    // Step 1: persist the user-edited graph. Confirm-all owns FSM advancement.
    if (updatedConnections.length > 0) {
      try {
        const payload = buildSaveConnectionPayload(updatedConnections);
        await saveConnections(activeSessionId, payload);
      } catch (error) {
        console.error('Error saving connections:', error);
        toast.error('Failed to save connection changes');
        return;
      }
    }

    // Step 2: advance FSM and send Temporal HITL signal.
    // confirmAllConnections rejects an empty architecture (HTTP 422) unless force=true.
    // If the user has no connections, require explicit acknowledgement before proceeding.
    const hasConnections = updatedConnections.filter((c) => c.from && c.to).length > 0;
    if (!hasConnections) {
      const confirmed = window.confirm(
        'No connections are defined. Confirm an empty architecture and proceed to subsystems?',
      );
      if (!confirmed) return;
    }

    // Hydrate workflowId synchronously if it's still null (fast refresh/confirm race).
    // workflowId is set asynchronously after load; if the user completes before that
    // promise resolves, the Temporal signal would be skipped. We check here as a fallback
    // so the signal is never silently dropped.
    let activeWorkflowId = workflowId;
    if (!activeWorkflowId) {
      try {
        const rs = await getConnectionReviewStatus(activeSessionId);
        if (rs.pending_review && rs.workflow_id) activeWorkflowId = rs.workflow_id;
      } catch {
        // Non-fatal: USE_TEMPORAL=false or network error — confirm-all still advances FSM
      }
    }

    try {
      await confirmAllConnections(activeSessionId, activeWorkflowId, !hasConnections);
    } catch (error) {
      console.error('confirmAllConnections failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to confirm architecture - please try again.');
      return;
    }

    // Step 3: update stage indicator in session context
    if (setCurrentStage) {
      try {
        await updateCurrentStageInContext(activeSessionId, setCurrentStage);
      } catch (error) {
        console.error('Error updating stage after architecture completion:', error);
      }
    }

    toast.success('System architecture defined!');
    navigateToStage('subsystems');
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing connections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="absolute left-4 top-4 z-20">
        <button
          type="button"
          onClick={() => setShowSubsystemOverlay((value) => !value)}
          className={`rounded-md border px-3 py-2 text-sm font-medium shadow-sm ${
            showSubsystemOverlay ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'
          }`}
          title="Show subsystem badges and unassigned subsystem warnings on component nodes"
        >
          {showSubsystemOverlay ? 'Hide Subsystems' : 'Show Subsystems'}
        </button>
      </div>
      <SystemArchitectureView
        components={showSubsystemOverlay ? components : components.map((component) => ({
          ...component,
          subsystemId: undefined,
          subsystemName: undefined,
          subsystemKey: undefined,
          subsystemColor: undefined,
          subsystemWarning: undefined,
        }))}
        onArchitectureComplete={handleArchitectureComplete}
        initialConnections={connections}
        initialUnresolvedConnections={unresolvedConnections}
        initialNets={nets}
        completionReadiness={completionReadiness}
        classificationMap={classificationMap}
        designId={activeSessionId || undefined}
        layoutScopeId={activeSessionId || undefined}
        onRefreshNets={refreshNets}
        onRefreshCompletionReadiness={refreshCompletionReadiness}
      />
      {showSubsystemOverlay && Object.keys(subsystemOverlay).length === 0 && (
        <div className="absolute left-4 top-16 z-20 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-sm">
          No subsystem data available yet.
        </div>
      )}
    </div>
  );
}
