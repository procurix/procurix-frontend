import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRequirementsData } from '@/app/pages/requirements/hooks/useRequirementsData';
import { type Requirement as APIRequirement, type SubsystemSummary } from '@/app/services/api';
import { useSubsystemsData, type UseSubsystemsData } from './useSubsystemsData';
import { useTechnicalGraphRun, type UseTechnicalGraphRun } from './useTechnicalGraphRun';

// Page-level state for the consolidated Design workspace (requirements +
// technical graph). Architecture connection analysis is no longer triggered
// from this page.

interface DesignContextValue {
  sessionId: string;
  requirementsData: ReturnType<typeof useRequirementsData>;
  subsystems: UseSubsystemsData;
  technicalGraph: UseTechnicalGraphRun;
  /** Subsystems shown in strip/panel/overlay — prefers technical-graph plan. */
  displaySubsystems: SubsystemSummary[];
  /** When set, the requirement detail modal is open for this requirement. */
  editingRequirement: APIRequirement | null;
  openRequirementEditor: (req: APIRequirement) => void;
  closeRequirementEditor: () => void;
  /** Whether subsystem badges/regions are visible on the architecture canvas. */
  showSubsystemOverlay: boolean;
  setShowSubsystemOverlay: (v: boolean) => void;
  panelOpenSubsystemId: string | null;
  setPanelOpenSubsystemId: (id: string | null) => void;
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const requirementsData = useRequirementsData(sessionId);
  const subsystems = useSubsystemsData(sessionId);
  const technicalGraph = useTechnicalGraphRun(sessionId);
  const [editingRequirement, setEditingRequirement] = useState<APIRequirement | null>(null);
  const [showSubsystemOverlay, setShowSubsystemOverlay] = useState(true);
  const [panelOpenSubsystemId, setPanelOpenSubsystemId] = useState<string | null>(null);

  const displaySubsystems = useMemo(() => {
    if (technicalGraph.subsystemSummaries.length > 0) {
      return technicalGraph.subsystemSummaries;
    }
    return [];
  }, [technicalGraph.subsystemSummaries]);

  // Notify architecture canvas to refresh overlay when TG subsystems arrive.
  useEffect(() => {
    if (technicalGraph.subsystemSummaries.length === 0) return;
    window.dispatchEvent(new CustomEvent('design:updated'));
  }, [technicalGraph.subsystemSummaries.length, technicalGraph.view]);

  // Auto-generate requirements on landing when the design has none yet.
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

  const value = useMemo<DesignContextValue>(
    () => ({
      sessionId,
      requirementsData,
      subsystems,
      technicalGraph,
      displaySubsystems,
      editingRequirement,
      openRequirementEditor: setEditingRequirement,
      closeRequirementEditor: () => setEditingRequirement(null),
      showSubsystemOverlay,
      setShowSubsystemOverlay,
      panelOpenSubsystemId,
      setPanelOpenSubsystemId,
    }),
    [sessionId, requirementsData, subsystems, technicalGraph, displaySubsystems, editingRequirement, showSubsystemOverlay, panelOpenSubsystemId],
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesignContext(): DesignContextValue {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error('useDesignContext must be used inside DesignProvider');
  return ctx;
}
