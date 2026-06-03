export {
  completeSubsystemArchitecture,
  confirmSubsystem,
  createSubsystemRequirement,
  generateSubsystemRequirements,
  generateSubsystems,
  getSubsystemDetails,
  getSubsystemReadiness,
  getSubsystemRequirementsBySubsystemId,
  getSubsystems,
  moveSubsystemPart,
  rejectSubsystem,
  updateSubsystem,
  updateSubsystemInterface,
} from './legacy';

export type {
  GenerateSubsystemRequirementsResponse,
  SubsystemDetailsResponse,
  SubsystemPartDetail,
  SubsystemReadinessItem,
  SubsystemReadinessResponse,
  SubsystemRequirementItem,
  SubsystemRequirementsResponse,
  SubsystemsResponse,
  SubsystemSummary,
} from './legacy';
