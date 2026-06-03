import type { SessionStage } from '@/app/types';
import type { LucideIcon } from 'lucide-react';
import { Upload, Zap, FileText, Box, CheckCircle, Layers, Filter, Sparkles, ClipboardCheck, Lock, SlidersHorizontal, Database } from 'lucide-react';
import { getWorkflowStageStatus, isWorkflowStageComplete, WORKFLOW_STAGES } from '@/app/shared/utils/workflowStages';

interface StageIndicatorProps {
  currentStage: SessionStage;
  // Backend current_stage means the highest unlocked next step, not the last completed step.
  maxReachedStage?: number | null;
  onStageClick?: (stage: SessionStage) => void;
}

const stageIcons: Partial<Record<SessionStage, LucideIcon>> = {
  upload: Upload,
  'part-identification': Filter,
  'system-identification': Sparkles,
  classification: SlidersHorizontal,
  enrichment: Database,
  validate: Zap,
  requirements: FileText,
  architecture: Layers,
  subsystems: Box,
  review: ClipboardCheck,
};

const stages = WORKFLOW_STAGES.map(stage => ({ ...stage, icon: stageIcons[stage.id] ?? CheckCircle }));

export function StageIndicator({ currentStage, maxReachedStage, onStageClick }: StageIndicatorProps) {
  const currentIndex = stages.findIndex((s) => s.id === currentStage);
  const safeCurrentIndex = currentIndex === -1 ? -1 : currentIndex;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {stages.map((stage, idx) => {
        const Icon = stage.icon;
        const status = getWorkflowStageStatus({
          stage,
          activeStage: currentStage,
          unlockedStageNumber: maxReachedStage,
          stageIndex: idx,
          activeStageIndex: safeCurrentIndex,
        });
        const isActive = status === 'active';
        const isComplete = status === 'complete';
        const isAvailable = status === 'active' || status === 'complete' || status === 'available';
        const isLocked = status === 'locked';

        return (
          <div key={stage.id} className="flex items-center">
            <button
              onClick={() => isAvailable && onStageClick?.(stage.id)}
              disabled={!isAvailable}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-500 text-white shadow-lg'
                  : isLocked
                  ? 'bg-slate-100 text-slate-400 border-2 border-slate-300 cursor-not-allowed opacity-75'
                  : isComplete
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : isAvailable
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
              title={
                isLocked
                  ? stage.id === 'upload'
                    ? 'Upload stage is locked after a design is created'
                    : 'Complete earlier stages to unlock this step'
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{stage.label}</span>
              {isLocked && stage.id === 'upload' && <Lock className="h-3 w-3" />}
              {isComplete && !isLocked && <CheckCircle className="h-4 w-4" />}
            </button>
            {idx < stages.length - 1 && (
              <div
                className={`h-0.5 w-8 mx-1 ${
                  maxReachedStage !== null && maxReachedStage !== undefined
                    ? isWorkflowStageComplete(stage.stageNumber, maxReachedStage)
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                    : idx < safeCurrentIndex
                      ? 'bg-green-500' 
                      : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
