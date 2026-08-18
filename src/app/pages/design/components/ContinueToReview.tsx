import { ArrowRight } from 'lucide-react';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';
import { useDesignContext } from '../state/DesignContext';
import { DisabledReasonHint } from './DisabledReasonHint';

// Continue is gated on technical-graph completion, not design_evolution
// subsystem generate / architecture confirm.

export function ContinueToReview() {
  const { navigateToStage } = useWorkflowNavigation();
  const { requirementsData, technicalGraph } = useDesignContext();

  const hasRequirements = requirementsData.requirements.length > 0;
  const enabled = hasRequirements && technicalGraph.isComplete;

  const reasons: string[] = [];
  if (!hasRequirements) reasons.push('Generate spec statements first.');
  else if (!technicalGraph.hasRun) reasons.push('Build the technical graph.');
  else if (!technicalGraph.isComplete) {
    reasons.push('Finish the technical graph workflow (approve the final graph).');
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex flex-col items-end">
      <button
        type="button"
        onClick={() => navigateToStage('review')}
        disabled={!enabled}
        className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-md transition-all ${
          enabled
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-300 text-slate-600 cursor-not-allowed'
        }`}
      >
        Continue to Review
        <ArrowRight className="h-4 w-4" />
      </button>
      {!enabled && (
        <div className="pointer-events-auto mt-2 max-w-[280px]">
          <DisabledReasonHint reasons={reasons} />
        </div>
      )}
    </div>
  );
}
