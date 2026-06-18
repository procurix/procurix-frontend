import { ArrowRight } from 'lucide-react';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';
import { useDesignContext } from '../state/DesignContext';
import { DisabledReasonHint } from './DisabledReasonHint';

// Floating "Continue to Review" button anchored bottom-right of the canvas.
// Gating order matches the new design flow:
//   1. At least one approved requirement
//   2. Subsystems generated (Generate Subsystems also implicitly confirms
//      the architecture, so connections are guaranteed by this point)
//   3. At least one subsystem requirement generated (any subsystem)

export function ContinueToReview() {
  const { navigateToStage } = useWorkflowNavigation();
  const { requirementsData, subsystems, subsystemRequirementsCount } = useDesignContext();

  const approvedReqs = requirementsData.summary.approved;
  const hasSubsystems = subsystems.subsystems.length > 0;
  const hasSubsystemRequirements = subsystemRequirementsCount > 0;
  const enabled = approvedReqs > 0 && hasSubsystems && hasSubsystemRequirements;

  const reasons: string[] = [];
  if (approvedReqs === 0) reasons.push('Approve at least one requirement.');
  if (!hasSubsystems) reasons.push('Generate subsystems.');
  if (hasSubsystems && !hasSubsystemRequirements) {
    reasons.push('Generate subsystem requirements (open a subsystem in the side panel).');
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
