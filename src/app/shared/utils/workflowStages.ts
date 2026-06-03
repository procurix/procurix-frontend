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

export const WORKFLOW_STAGES: WorkflowStageConfig[] = [
  { id: 'upload', label: 'Upload', route: '/upload', stageNumber: 1 },
  { id: 'part-identification', label: 'Part Identification', route: '/part-identification', stageNumber: 2 },
  { id: 'system-identification', label: 'System Identification', route: '/system-identification', stageNumber: 3 },
  { id: 'classification', label: 'Classification', route: '/classification', stageNumber: 4 },
  { id: 'enrichment', label: 'Enrichment', route: '/enrichment', stageNumber: 5 },
  { id: 'validate', label: 'Part Review', route: '/validate', stageNumber: 6 },
  { id: 'requirements', label: 'Requirements', route: '/requirements', stageNumber: 7 },
  { id: 'architecture', label: 'Architecture', route: '/architecture', stageNumber: 8 },
  { id: 'subsystems', label: 'Subsystems', route: '/subsystems', stageNumber: 9 },
  { id: 'review', label: 'Review', route: '/completed', stageNumber: 10 },
];

export const TOTAL_WORKFLOW_STAGES = WORKFLOW_STAGES.length;

export const STAGE_TO_ROUTE = Object.fromEntries(
  WORKFLOW_STAGES.map(stage => [stage.id, stage.route]),
) as Partial<Record<SessionStage, string>>;

export const ROUTE_TO_STAGE = Object.fromEntries(
  WORKFLOW_STAGES.map(stage => [stage.route, stage.id]),
) as Record<string, SessionStage>;

export const STAGE_TO_NUMBER = Object.fromEntries(
  WORKFLOW_STAGES.map(stage => [stage.id, stage.stageNumber]),
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
