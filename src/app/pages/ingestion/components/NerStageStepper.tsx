import type { NerStage } from '@/app/services/api/ingestion';
import { cn } from '@/app/shared/components/ui/utils';

const STAGES: { id: NerStage; label: string }[] = [
  { id: 'candidate', label: 'Candidates' },
  { id: 'cluster', label: 'Clusters' },
  { id: 'mapping', label: 'Mapping' },
];

interface NerStageStepperProps {
  currentStage: NerStage;
  sessionStatus: string;
}

export function NerStageStepper({ currentStage, sessionStatus }: NerStageStepperProps) {
  const stageIndex = STAGES.findIndex((s) => s.id === currentStage);
  const persisted = sessionStatus === 'persisted';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {STAGES.map((stage, index) => {
        const done = persisted || index < stageIndex || (index === stageIndex && sessionStatus === 'reviewed' && currentStage === 'mapping');
        const active = !persisted && index === stageIndex;
        return (
          <div key={stage.id} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-300">→</span>}
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 font-medium',
                done && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                active && !done && 'border-blue-300 bg-blue-50 text-blue-800',
                !done && !active && 'border-slate-200 bg-white text-slate-500',
              )}
            >
              {index + 1}. {stage.label}
            </span>
          </div>
        );
      })}
      <span className="text-slate-300">→</span>
      <span
        className={cn(
          'rounded-full border px-2.5 py-1 font-medium',
          persisted
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-500',
        )}
      >
        4. Persist
      </span>
    </div>
  );
}
