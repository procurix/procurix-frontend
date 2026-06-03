import type { ArchitectureNet } from '@/app/services/api';

export type ProposalAction =
  | 'flag_issue'
  | 'unresolved_connection'
  | 'resolve_pin'
  | 'rename_net'
  | 'change_net_type'
  | 'split_net'
  | 'merge_nets'
  | 'add_member'
  | 'remove_member';

export type RefreshTarget = 'nets' | 'readiness';

export type ArchitectureAssistantProposal = {
  id?: string;
  status?: string;
  action?: string | null;
  proposal_type?: string | null;
  title?: string | null;
  reasoning?: string | null;
  confidence?: number | null;
  target_net_id?: string | null;
  target_connection_id?: string | null;
  source_net_ids?: string[];
  connection_ids?: string[];
  payload?: Record<string, unknown>;
};

export interface ProposalActionConfig {
  action: ProposalAction;
  applyable: boolean;
  dismissable: boolean;
  label: string;
  required?: {
    targetNetId?: boolean;
    sourceNetIds?: boolean;
    connectionIds?: boolean;
    payloadFields?: string[];
  };
  refreshAfterApply: RefreshTarget[];
  refreshAfterDismiss: RefreshTarget[];
  conditionalNetRefresh?: boolean;
}

export const proposalActionRegistry: Record<ProposalAction, ProposalActionConfig> = {
  flag_issue: {
    action: 'flag_issue',
    applyable: false,
    dismissable: true,
    label: 'Risk noted',
    refreshAfterApply: [],
    refreshAfterDismiss: [],
  },
  unresolved_connection: {
    action: 'unresolved_connection',
    applyable: false,
    dismissable: true,
    label: 'Resolve in queue',
    refreshAfterApply: [],
    refreshAfterDismiss: [],
  },
  resolve_pin: {
    action: 'resolve_pin',
    applyable: true,
    dismissable: true,
    label: 'Apply pins',
    required: { payloadFields: ['proposal_id', 'source_pin', 'target_pin'] },
    refreshAfterApply: ['readiness'],
    refreshAfterDismiss: [],
    conditionalNetRefresh: true,
  },
  rename_net: {
    action: 'rename_net',
    applyable: true,
    dismissable: true,
    label: 'Apply rename',
    required: { targetNetId: true, payloadFields: ['name'] },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
  change_net_type: {
    action: 'change_net_type',
    applyable: true,
    dismissable: true,
    label: 'Apply type',
    required: { targetNetId: true, payloadFields: ['net_type'] },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
  split_net: {
    action: 'split_net',
    applyable: true,
    dismissable: true,
    label: 'Apply split',
    required: { targetNetId: true, connectionIds: true },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
  merge_nets: {
    action: 'merge_nets',
    applyable: true,
    dismissable: true,
    label: 'Apply merge',
    required: { targetNetId: true, sourceNetIds: true },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
  add_member: {
    action: 'add_member',
    applyable: true,
    dismissable: true,
    label: 'Add member',
    required: { targetNetId: true, connectionIds: true },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
  remove_member: {
    action: 'remove_member',
    applyable: true,
    dismissable: true,
    label: 'Remove member',
    required: { targetNetId: true, connectionIds: true },
    refreshAfterApply: ['nets', 'readiness'],
    refreshAfterDismiss: [],
  },
};

function isProposalAction(value: string): value is ProposalAction {
  return Object.prototype.hasOwnProperty.call(proposalActionRegistry, value);
}

export function proposalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function proposalStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function proposalPayload(proposal: ArchitectureAssistantProposal): Record<string, unknown> {
  return proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
}

export function getProposalAction(proposal: ArchitectureAssistantProposal): ProposalAction {
  const raw = proposalString(proposal.action || proposal.proposal_type);
  return isProposalAction(raw) ? raw : 'flag_issue';
}

export function getProposalConfig(proposalOrAction: ArchitectureAssistantProposal | string): ProposalActionConfig {
  const action = typeof proposalOrAction === 'string'
    ? proposalOrAction
    : getProposalAction(proposalOrAction);
  return isProposalAction(action) ? proposalActionRegistry[action] : proposalActionRegistry.flag_issue;
}

export function canApplyProposal(proposal: ArchitectureAssistantProposal): boolean {
  return getProposalConfig(proposal).applyable && proposal.status !== 'applied' && proposal.status !== 'dismissed';
}

export function canDismissProposal(proposal: ArchitectureAssistantProposal): boolean {
  return Boolean(proposal.id) && getProposalConfig(proposal).dismissable && proposal.status !== 'applied' && proposal.status !== 'dismissed';
}

export function getProposalTargetNetId(proposal: ArchitectureAssistantProposal): string {
  const payload = proposalPayload(proposal);
  return proposalString(proposal.target_net_id) || proposalString(payload.target_net_id) || proposalString(payload.net_id);
}

export function getProposalConnectionIds(proposal: ArchitectureAssistantProposal): string[] {
  return Array.from(new Set([
    ...(proposal.connection_ids || []),
    ...proposalStringList(proposalPayload(proposal).connection_ids),
  ]));
}

export function getProposalSourceNetIds(proposal: ArchitectureAssistantProposal): string[] {
  return Array.from(new Set([
    ...(proposal.source_net_ids || []),
    ...proposalStringList(proposalPayload(proposal).source_net_ids),
  ]));
}

export function validateProposalPayload(proposal: ArchitectureAssistantProposal): void {
  const config = getProposalConfig(proposal);
  if (!config.applyable) return;

  const missing: string[] = [];
  const required = config.required;
  if (required?.targetNetId && !getProposalTargetNetId(proposal)) missing.push('target_net_id');
  if (required?.connectionIds && getProposalConnectionIds(proposal).length === 0) missing.push('connection_ids');
  if (required?.sourceNetIds && getProposalSourceNetIds(proposal).length === 0) missing.push('source_net_ids');

  const payload = proposalPayload(proposal);
  for (const field of required?.payloadFields || []) {
    if (!proposalString(payload[field])) missing.push(`payload.${field}`);
  }

  if (missing.length > 0) {
    throw new Error(`Proposal is missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  }
}

function netName(nets: ArchitectureNet[], netId: string): string {
  const net = nets.find((item) => item.id === netId);
  return net?.name || netId || 'net';
}

export function renderProposalDetails(proposal: ArchitectureAssistantProposal, nets: ArchitectureNet[] = []): string | null {
  const action = getProposalAction(proposal);
  const payload = proposalPayload(proposal);
  const targetNetId = getProposalTargetNetId(proposal);
  const targetNetName = targetNetId ? netName(nets, targetNetId) : '';
  const connectionCount = getProposalConnectionIds(proposal).length;
  const sourceNetCount = getProposalSourceNetIds(proposal).length;

  if (action === 'rename_net') {
    const nextName = proposalString(payload.name);
    return nextName ? `Rename: ${targetNetName || 'net'} -> ${nextName}` : null;
  }
  if (action === 'change_net_type') {
    const currentType = nets.find((item) => item.id === targetNetId)?.net_type || 'current';
    const nextType = proposalString(payload.net_type);
    return nextType ? `Type: ${currentType} -> ${nextType}` : null;
  }
  if (action === 'split_net') {
    return `Split ${connectionCount || 'selected'} link${connectionCount === 1 ? '' : 's'} from ${targetNetName || 'target net'}`;
  }
  if (action === 'merge_nets') {
    return `Merge ${sourceNetCount || 'source'} net${sourceNetCount === 1 ? '' : 's'} into ${targetNetName || 'target net'}`;
  }
  if (action === 'add_member') {
    return `Add ${connectionCount || 'selected'} link${connectionCount === 1 ? '' : 's'} to ${targetNetName || 'target net'}`;
  }
  if (action === 'remove_member') {
    return `Remove ${connectionCount || 'selected'} link${connectionCount === 1 ? '' : 's'} from ${targetNetName || 'target net'}`;
  }
  if (action === 'resolve_pin') {
    const sourcePin = proposalString(payload.source_pin);
    const targetPin = proposalString(payload.target_pin);
    return sourcePin && targetPin ? `Pins: ${sourcePin} -> ${targetPin}` : null;
  }
  if (action === 'flag_issue') {
    return proposalString(payload.note) || null;
  }
  return null;
}
