import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Eye, EyeOff, Loader2, Network, RefreshCw } from 'lucide-react';
import { ArchitecturePage } from '@/app/pages/architecture/ArchitecturePage';
import { useDesignContext } from '../state/DesignContext';
import { ContinueToReview } from './ContinueToReview';
import { DisabledReasonHint } from './DisabledReasonHint';
import { TechnicalGraphActionBar } from './TechnicalGraphActionBar';
import { partLabelsFromDelta, proposedDeltaConnections } from '../utils/technicalGraphMappers';
import { mapTgaConnections } from '@/app/pages/architecture/utils/connectionMapping';

// Design embeds ArchitecturePage in readOnly mode for BOM/pinout display only.
// Connection analysis and subsystem generate are not triggered from this page.

const OVERLAY_VIEWS = new Set(['circuit_segment_review', 'graph_segment_context_viewer']);

export function DesignCanvas() {
  const {
    sessionId,
    displaySubsystems,
    technicalGraph,
    showSubsystemOverlay,
    setShowSubsystemOverlay,
    requirementsData,
  } = useDesignContext();
  const waitingForRequirements =
    requirementsData.isGenerating || requirementsData.requirements.length === 0;
  const hasDisplaySubsystems = displaySubsystems.length > 0;

  // Accumulate overlay connections across all segments so previously-built
  // segments stay visible as the workflow advances to new ones.
  // Keyed by connection ID to avoid duplicates. Reset when the run changes.
  const [accumulatedConnections, setAccumulatedConnections] = useState<
    Map<string, ReturnType<typeof mapTgaConnections>[number]>
  >(new Map());
  const [accumulatedPartLabels, setAccumulatedPartLabels] = useState<Record<string, string>>({});
  const lastRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset when a new run starts.
    if (technicalGraph.runId !== lastRunIdRef.current) {
      lastRunIdRef.current = technicalGraph.runId;
      setAccumulatedConnections(new Map());
      setAccumulatedPartLabels({});
    }

    if (!technicalGraph.view || !OVERLAY_VIEWS.has(technicalGraph.view)) return;

    const { connections, pinMappings } = proposedDeltaConnections(technicalGraph.data);
    const incoming = mapTgaConnections(connections, pinMappings);
    const incomingLabels = partLabelsFromDelta(technicalGraph.data);

    if (incoming.length === 0) return;

    setAccumulatedConnections((prev) => {
      const next = new Map<string, ReturnType<typeof mapTgaConnections>[number]>();
      // Mark all previous connections as no longer current.
      for (const [id, conn] of prev) next.set(id, { ...conn, isCurrentDelta: false });
      // Add / overwrite with the incoming connections marked as current.
      for (const conn of incoming) next.set(conn.id, { ...conn, isCurrentDelta: true });
      return next;
    });
    setAccumulatedPartLabels((prev) => ({ ...prev, ...incomingLabels }));
  }, [technicalGraph.runId, technicalGraph.view, technicalGraph.data]);

  const overlayConnections = useMemo(
    () => Array.from(accumulatedConnections.values()),
    [accumulatedConnections],
  );
  const overlayPartLabels = accumulatedPartLabels;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Network className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">Technical graph</h2>
        <div className="ml-auto flex items-center gap-2">
          {hasDisplaySubsystems && (
            <button
              type="button"
              onClick={() => setShowSubsystemOverlay(!showSubsystemOverlay)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                showSubsystemOverlay
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Toggle subsystem badges on component nodes"
            >
              {showSubsystemOverlay ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Overlay
            </button>
          )}
          {!technicalGraph.hasRun && <BuildTechnicalGraphButton />}
          {technicalGraph.hasRun && (
            <button
              type="button"
              onClick={() => void technicalGraph.start()}
              disabled={technicalGraph.busy}
              className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Restart technical graph run for this design"
            >
              {technicalGraph.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Restart graph
            </button>
          )}
        </div>
      </header>
      {technicalGraph.hasRun && <TechnicalGraphActionBar />}
      {hasDisplaySubsystems && <SubsystemStrip />}
      <div className="relative flex-1 min-h-0">
        {sessionId ? (
          <ArchitecturePage
            readOnly
            showSubsystemOverlay={showSubsystemOverlay}
            hideCompleteButton
            externalSubsystems={technicalGraph.subsystemSummaries}
            overlayConnections={overlayConnections}
            overlayPartLabels={overlayPartLabels}
            technicalGraphPartLookup={technicalGraph.partLookup}
          />
        ) : null}
        {waitingForRequirements && <ArchitecturePendingOverlay />}
        <ContinueToReview />
      </div>
    </div>
  );
}

function BuildTechnicalGraphButton() {
  const { technicalGraph, requirementsData } = useDesignContext();

  const reasons: string[] = [];
  if (requirementsData.isGenerating) {
    reasons.push('Wait for spec statements to finish generating.');
  } else if (requirementsData.requirements.length === 0) {
    reasons.push('Generate spec statements first. Technical graph needs parts + requirements.');
  }

  const disabled = technicalGraph.busy || reasons.length > 0;
  const label = technicalGraph.busy ? 'Starting…' : 'Build technical graph';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void technicalGraph.start()}
        disabled={disabled}
        className="flex items-center gap-1 rounded border border-slate-200 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
        title={reasons.length > 0 ? reasons.join(' ') : 'Start technical graph from parts and requirements'}
      >
        <Box className="h-3 w-3" />
        {label}
      </button>
      {disabled && reasons.length > 0 && !technicalGraph.busy && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[280px]">
          <DisabledReasonHint reasons={reasons} />
        </div>
      )}
    </div>
  );
}

function ArchitecturePendingOverlay() {
  const { requirementsData } = useDesignContext();
  const isGenerating = requirementsData.isGenerating;

  const headline = 'Waiting for spec statements…';
  const subline = isGenerating
    ? 'Generating spec statements — then you can build the technical graph.'
    : 'Generate spec statements before building the technical graph.';

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/85 backdrop-blur-sm">
      <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-md">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <div className="text-sm font-semibold text-slate-800">{headline}</div>
        <div className="max-w-[280px] text-center text-xs text-slate-500">{subline}</div>
      </div>
    </div>
  );
}

function SubsystemStrip() {
  const {
    displaySubsystems,
    setPanelOpenSubsystemId,
    panelOpenSubsystemId,
  } = useDesignContext();

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
          Subsystems
        </span>
        <ul className="flex items-center gap-1.5">
          {displaySubsystems.map(sub => {
            const id = sub.subsystem_id || sub.id;
            const active = panelOpenSubsystemId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setPanelOpenSubsystemId(active ? null : id)}
                  className={`rounded border px-2 py-1 text-xs ${
                    active
                      ? 'border-blue-300 bg-blue-100 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                  title={sub.description ?? sub.name}
                >
                  {sub.name}
                  {typeof sub.evidence?.part_count === 'number' && (
                    <span className="ml-1 text-[10px] text-slate-500">
                      ({sub.evidence.part_count})
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
