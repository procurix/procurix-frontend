import type { SessionStage } from '@/app/types';

// Stage numbering convention, matching api.ts FSM-to-stage mapping:
// the backend stage number is the next unlocked step the user may visit.
// Example: fsm_state="requirements_generated" maps to stage 8, so requirements
// are done and architecture is now unlocked. Stage 8 itself is not complete yet.

export interface WorkflowStageConfig {
  id: SessionStage;
  label: string;
  route: string;
  stageNumber: number;
}

export type WorkflowStageStatus = 'active' | 'complete' | 'available' | 'locked';

// 2026-06-12: Requirements + Architecture + Subsystems consolidated into a
// single "Design" workspace. The /design page hosts the requirements rail,
// architecture canvas, and subsystem side panel; edits to requirements
// auto-rerun the architecture analyzer. The /requirements, /architecture,
// and /subsystems routes still exist for debugging but are not in the
// indicator. Stage indicator collapsed from 6 to 4.
export const WORKFLOW_STAGES: WorkflowStageConfig[] = [
  { id: 'upload', label: 'Upload', route: '/upload', stageNumber: 1 },
  { id: 'classification', label: 'Classification', route: '/classification', stageNumber: 2 },
  { id: 'design', label: 'Design', route: '/design', stageNumber: 3 },
  { id: 'review', label: 'Review', route: '/review', stageNumber: 4 },
];

// Legacy stages — kept addressable via route lookups so deep links to
// /requirements, /architecture, /subsystems still resolve, but not shown
// in the StageIndicator above. New code should target 'design' instead.
const LEGACY_STAGES: WorkflowStageConfig[] = [
  { id: 'requirements', label: 'Requirements', route: '/requirements', stageNumber: 3 },
  { id: 'architecture', label: 'Architecture', route: '/architecture', stageNumber: 3 },
  { id: 'subsystems', label: 'Subsystems', route: '/subsystems', stageNumber: 3 },
];

const ALL_STAGE_ENTRIES = [...WORKFLOW_STAGES, ...LEGACY_STAGES];

export const TOTAL_WORKFLOW_STAGES = WORKFLOW_STAGES.length;

export const STAGE_TO_ROUTE = Object.fromEntries(
  ALL_STAGE_ENTRIES.map(stage => [stage.id, stage.route]),
) as Partial<Record<SessionStage, string>>;

export const ROUTE_TO_STAGE = Object.fromEntries(
  ALL_STAGE_ENTRIES.map(stage => [stage.route, stage.id]),
) as Record<string, SessionStage>;

export const STAGE_TO_NUMBER = Object.fromEntries(
  ALL_STAGE_ENTRIES.map(stage => [stage.id, stage.stageNumber]),
) as Partial<Record<SessionStage, number>>;

export function getRouteForStage(stageNumber: number): string {
  return WORKFLOW_STAGES.find(stage => stage.stageNumber === stageNumber)?.route ?? '/upload';
}

export function getStageForNumber(stageNumber: number): SessionStage {
  return [...WORKFLOW_STAGES]
    .reverse()
    .find(stage => stageNumber >= stage.stageNumber)?.id ?? 'upload';
}

export function getStageNumber(stage: SessionStage | null | undefined): number | null {
  if (!stage) return null;
  return STAGE_TO_NUMBER[stage] ?? null;
}

export function isWorkflowStageUnlocked(
  stageNumber: number,
  unlockedStageNumber: number | null | undefined,
): boolean {
  return unlockedStageNumber !== null
    && unlockedStageNumber !== undefined
    && stageNumber <= unlockedStageNumber;
}

export function isWorkflowStageComplete(
  stageNumber: number,
  unlockedStageNumber: number | null | undefined,
): boolean {
  return unlockedStageNumber !== null
    && unlockedStageNumber !== undefined
    && stageNumber < unlockedStageNumber;
}

interface WorkflowStageStatusInput {
  stage: WorkflowStageConfig;
  activeStage: SessionStage | null | undefined;
  unlockedStageNumber?: number | null;
  stageIndex: number;
  activeStageIndex: number;
  earliestNavigableStageNumber?: number;
}

export function getWorkflowStageStatus({
  stage,
  activeStage,
  unlockedStageNumber,
  stageIndex,
  activeStageIndex,
  earliestNavigableStageNumber = 2,
}: WorkflowStageStatusInput): WorkflowStageStatus {
  const isNavigableByPolicy = stage.stageNumber >= earliestNavigableStageNumber;

  if (unlockedStageNumber !== null && unlockedStageNumber !== undefined) {
    if (!isWorkflowStageUnlocked(stage.stageNumber, unlockedStageNumber)) return 'locked';
    if (stage.id === activeStage) return 'active';
    if (!isNavigableByPolicy) return 'locked';
    return isWorkflowStageComplete(stage.stageNumber, unlockedStageNumber) ? 'complete' : 'available';
  }

  if (activeStageIndex < 0) return 'locked';
  if (!isNavigableByPolicy) return 'locked';
  if (stageIndex < activeStageIndex) return 'complete';
  if (stageIndex === activeStageIndex) return 'active';
  return 'locked';
}

export function withSession(route: string, sessionId?: string | null): string {
  return sessionId ? `${route}?session=${sessionId}` : route;
}
