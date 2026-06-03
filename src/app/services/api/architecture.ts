export {
  analyzeConnections,
  applyArchitectureProposal,
  applyArchitectureProposalWithResult,
  confirmAllConnections,
  createConnection,
  deleteConnection,
  dismissArchitectureProposal,
  getArchitectureCompletionReadiness,
  getArchitectureProposals,
  getConnectionReviewStatus,
  getConnections,
  resolveConnectionPins,
  saveConnections,
  updateConnection,
} from './legacy';

export type {
  ArchitectureCompletionReadiness,
  ArchitectureCompletionReadinessItem,
  ArchitectureProposalAction,
  ArchitectureProposalRecord,
  ArchitectureProposalsResponse,
  Connection,
  ConnectionInferenceSource,
  ConnectionsResponse,
  ConnectionStatusResponse,
  SubsystemConnection,
} from './legacy';
