import { Box, Eye, EyeOff, Loader2, Network, RefreshCw, Pause, Play } from 'lucide-react';
import { ArchitecturePage } from '@/app/pages/architecture/ArchitecturePage';
import { useDesignContext } from '../state/DesignContext';
import { ContinueToReview } from './ContinueToReview';
import { DisabledReasonHint } from './DisabledReasonHint';

// The Design page embeds the existing ArchitecturePage in readOnly mode so
// we reuse all its data wiring (BOM, classification, nets, proposals,
// completion readiness, pinouts) without duplicating it. Our markStale
// pipeline dispatches a 'design:updated' event after analyzeConnections so
// the embedded page refetches. Subsystem overlay state lives in the design
// context and is passed down via a controlled prop.

export function DesignCanvas() {
  const {
    architecture,
    autoRerun,
    setAutoRerun,
    sessionId,
    subsystems,
    showSubsystemOverlay,
    setShowSubsystemOverlay,
    requirementsData,
  } = useDesignContext();
  const { isRecomputing, regenerate } = architecture;
  // Architecture can't be generated until requirements exist. While the
  // requirements pipeline is still spinning (generating, or simply not
  // present yet), show an overlay instead of letting the embedded
  // ArchitecturePage repeatedly 409.
  const waitingForRequirements =
    requirementsData.isGenerating || requirementsData.requirements.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Network className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">Architecture</h2>
        {isRecomputing && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Recomputing…
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRerun(!autoRerun)}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            title={autoRerun ? 'Pause auto-rerun on requirement edits' : 'Resume auto-rerun on requirement edits'}
          >
            {autoRerun ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {autoRerun ? 'Auto' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={isRecomputing}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRecomputing ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {subsystems.subsystems.length > 0 && (
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
          {subsystems.subsystems.length === 0 && <GenerateSubsystemsButton />}
        </div>
      </header>
      {subsystems.subsystems.length > 0 && <SubsystemStrip />}
      <div className="relative flex-1 min-h-0">
        {sessionId ? (
          <ArchitecturePage readOnly showSubsystemOverlay={showSubsystemOverlay} hideCompleteButton />
        ) : null}
        {waitingForRequirements && <ArchitecturePendingOverlay />}
        <ContinueToReview />
      </div>
    </div>
  );
}

function GenerateSubsystemsButton() {
  const { subsystems, architectureReadiness } = useDesignContext();
  const { readiness } = architectureReadiness;

  // Single rule: subsystem generation is gated on architecture readiness
  // reporting can_complete. Until the user has resolved every architecture
  // blocker (suggested nets, pinless connections, etc.), this stays
  // disabled. The hint lists the blocker count so the user knows where to
  // look (review queue on the canvas).
  const reasons: string[] = [];
  if (!readiness) {
    reasons.push('Loading architecture readiness…');
  } else if (!readiness.can_complete) {
    const blockerCount = readiness.blockers?.length ?? 0;
    reasons.push(
      blockerCount > 0
        ? `Complete the architecture first — ${blockerCount} blocker${blockerCount === 1 ? '' : 's'} remaining in the review queue.`
        : 'Complete the architecture first.',
    );
  }

  const disabled = subsystems.isGenerating || reasons.length > 0;
  const label = subsystems.isGenerating
    ? 'Generating…'
    : subsystems.subsystems.length > 0
    ? 'Regenerate Subsystems'
    : 'Generate Subsystems';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void subsystems.generate()}
        disabled={disabled}
        className="flex items-center gap-1 rounded border border-slate-200 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
        title={reasons.length > 0 ? reasons.join(' ') : 'Generate subsystems from the architecture'}
      >
        <Box className="h-3 w-3" />
        {label}
      </button>
      {disabled && reasons.length > 0 && !subsystems.isGenerating && (
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

  const headline = isGenerating
    ? 'Architecture design in progress…'
    : 'Architecture design in progress…';
  const subline = isGenerating
    ? 'Generating requirements first — the architecture will appear as soon as requirements are ready.'
    : 'Waiting for requirements before the architecture can be generated.';

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
  const { subsystems, setPanelOpenSubsystemId, panelOpenSubsystemId } = useDesignContext();

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
          Subsystems
        </span>
        {subsystems.isStale && (
          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
            may be stale
          </span>
        )}
        <ul className="flex items-center gap-1.5">
          {subsystems.subsystems.map(sub => {
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
