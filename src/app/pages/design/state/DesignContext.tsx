import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRequirementsData } from '@/app/pages/requirements/hooks/useRequirementsData';
import { getAllSubsystemRequirements, type Requirement as APIRequirement } from '@/app/services/api';
import { useArchitectureData, type UseArchitectureData } from './useArchitectureData';
import { useArchitectureReadiness, type UseArchitectureReadiness } from './useArchitectureReadiness';
import { useSubsystemsData, type UseSubsystemsData } from './useSubsystemsData';

// Page-level state for the consolidated Design workspace (requirements +
// architecture + subsystems). Single context to avoid prop-drilling between
// the rail, canvas, and subsystem panel.

interface DesignContextValue {
  sessionId: string;
  requirementsData: ReturnType<typeof useRequirementsData>;
  architecture: UseArchitectureData;
  architectureReadiness: UseArchitectureReadiness;
  subsystems: UseSubsystemsData;
  /** When set, the requirement detail modal is open for this requirement. */
  editingRequirement: APIRequirement | null;
  openRequirementEditor: (req: APIRequirement) => void;
  closeRequirementEditor: () => void;
  /** When false, the architecture analyzer will not auto-rerun on req edits. */
  autoRerun: boolean;
  setAutoRerun: (v: boolean) => void;
  /** Whether subsystem badges/regions are visible on the architecture canvas. */
  showSubsystemOverlay: boolean;
  setShowSubsystemOverlay: (v: boolean) => void;
  panelOpenSubsystemId: string | null;
  setPanelOpenSubsystemId: (id: string | null) => void;
  /** Count of subsystem-level requirements across all subsystems. Used to
   *  gate Continue to Review. Refetched when subsystems change and when
   *  'design:subsystem-requirements-changed' fires. */
  subsystemRequirementsCount: number;
  refreshSubsystemRequirementsCount: () => void;
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const requirementsData = useRequirementsData(sessionId);
  const [autoRerun, setAutoRerun] = useState(true);
  const architecture = useArchitectureData(sessionId, autoRerun);
  const architectureReadiness = useArchitectureReadiness(sessionId);
  const subsystems = useSubsystemsData(sessionId);
  const [editingRequirement, setEditingRequirement] = useState<APIRequirement | null>(null);
  const [showSubsystemOverlay, setShowSubsystemOverlay] = useState(true);
  const [panelOpenSubsystemId, setPanelOpenSubsystemId] = useState<string | null>(null);
  const [subsystemRequirementsCount, setSubsystemRequirementsCount] = useState(0);
  const [subsystemReqsRefreshTick, setSubsystemReqsRefreshTick] = useState(0);

  // Fetch subsystem-requirements coverage. Used to gate Continue to Review.
  // Refetches when subsystems exist (otherwise the endpoint isn't ready) or
  // when the panel emits a refresh tick after a generate.
  useEffect(() => {
    if (subsystems.subsystems.length === 0) {
      setSubsystemRequirementsCount(0);
      return;
    }
    let cancelled = false;
    getAllSubsystemRequirements(sessionId)
      .then(r => {
        if (!cancelled) setSubsystemRequirementsCount(r.requirements_count ?? 0);
      })
      .catch(() => {
        // Endpoint may 404 before any subsystem requirements exist.
        if (!cancelled) setSubsystemRequirementsCount(0);
      });
    return () => { cancelled = true; };
  }, [sessionId, subsystems.subsystems.length, subsystemReqsRefreshTick]);

  // When the architecture analyzer finishes a re-run, mark any existing
  // subsystems as stale so the UI can prompt for regeneration. We watch the
  // 'isRecomputing' transition from true → false (i.e. an analyze finished).
  const wasRecomputingRef = useRef(false);
  useEffect(() => {
    if (wasRecomputingRef.current && !architecture.isRecomputing) {
      subsystems.markStaleFromArchitecture();
    }
    wasRecomputingRef.current = architecture.isRecomputing;
  }, [architecture.isRecomputing, subsystems]);

  // Auto-generate requirements on landing when the design has none yet.
  // Fires once per provider mount. Subsequent navigations away & back will
  // re-trigger if requirements are still empty — that's intentional, since
  // a fresh empty state on landing means the user expects them generated.
  const autoGenReqsFiredRef = useRef(false);
  useEffect(() => {
    if (autoGenReqsFiredRef.current) return;
    if (!requirementsData.needsGeneration) return;
    if (requirementsData.isGenerating) return;
    if (requirementsData.requirements.length > 0) return;
    autoGenReqsFiredRef.current = true;
    void requirementsData.triggerGeneration();
  }, [
    requirementsData.needsGeneration,
    requirementsData.isGenerating,
    requirementsData.requirements.length,
    requirementsData.triggerGeneration,
  ]);

  // Auto-rerun architecture analyzer when every requirement is approved.
  // Fires once per provider mount: either as soon as the requirements load
  // already-fully-approved, or on the transition into that state after the
  // user clicks Approve All. We don't suppress the initial-load case
  // anymore — if you land on a fully-approved session and the architecture
  // is empty, you probably *want* it generated.
  const archAutoRanRef = useRef(false);
  useEffect(() => {
    if (archAutoRanRef.current) return;
    const total = requirementsData.requirements.length;
    const approved = requirementsData.summary.approved;
    if (total === 0) return;
    if (approved !== total) return;
    archAutoRanRef.current = true;
    void architecture.regenerate();
  }, [
    requirementsData.requirements.length,
    requirementsData.summary.approved,
    architecture,
  ]);

  const value = useMemo<DesignContextValue>(
    () => ({
      sessionId,
      requirementsData,
      architecture,
      architectureReadiness,
      subsystems,
      editingRequirement,
      openRequirementEditor: setEditingRequirement,
      closeRequirementEditor: () => setEditingRequirement(null),
      autoRerun,
      setAutoRerun,
      showSubsystemOverlay,
      setShowSubsystemOverlay,
      panelOpenSubsystemId,
      setPanelOpenSubsystemId,
      subsystemRequirementsCount,
      refreshSubsystemRequirementsCount: () => setSubsystemReqsRefreshTick(t => t + 1),
    }),
    [sessionId, requirementsData, architecture, architectureReadiness, subsystems, editingRequirement, autoRerun, showSubsystemOverlay, panelOpenSubsystemId, subsystemRequirementsCount],
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesignContext(): DesignContextValue {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error('useDesignContext must be used inside DesignProvider');
  return ctx;
}
