import type { SubsystemSummary } from '@/app/services/api';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

export interface DiscoverySubsystem {
  id: string;
  name: string;
  purpose?: string;
  part_ids: string[];
  requirement_ids: string[];
  protocols?: string[];
  rationale?: string[];
  confidence?: number;
}

export function discoveryPlanFromData(data: Record<string, unknown> | null | undefined) {
  const plan = asRecord(data?.subsystem_discovery_plan);
  if (!plan) return null;
  const subsystemsRaw = Array.isArray(plan.subsystems) ? plan.subsystems : [];
  const subsystems: DiscoverySubsystem[] = subsystemsRaw.flatMap((row) => {
    const item = asRecord(row);
    if (!item) return [];
    const id = asString(item.id);
    if (!id) return [];
    return [{
      id,
      name: asString(item.name) || id,
      purpose: asString(item.purpose) || undefined,
      part_ids: asStringList(item.part_ids),
      requirement_ids: asStringList(item.requirement_ids),
      protocols: asStringList(item.protocols),
      rationale: asStringList(item.rationale),
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    }];
  });
  return {
    ...plan,
    subsystems,
    coverage: asRecord(plan.coverage) || asRecord(data?.coverage),
  };
}

/** Map technical-graph discovery subsystems into Design SubsystemSummary shape. */
export function subsystemsFromDiscoveryPlan(
  data: Record<string, unknown> | null | undefined,
): SubsystemSummary[] {
  const plan = discoveryPlanFromData(data);
  if (!plan) return [];
  return plan.subsystems.map((sub) => {
    const partIds = sub.part_ids;
    return {
      id: sub.id,
      subsystem_id: sub.id,
      subsystem_key: sub.id,
      name: sub.name,
      type: 'technical_graph',
      original_subsystem_id: sub.id,
      description: sub.purpose ?? null,
      status: 'suggested',
      confidence: sub.confidence ?? null,
      rationale: (sub.rationale || []).join(' ') || null,
      warnings: [],
      evidence: {
        part_count: partIds.length,
        functional_roles: sub.protocols || [],
      },
      topology: null,
      topology_family: null,
      componentIds: partIds,
      mpns: [],
      bom_reference: partIds,
      parts: partIds.map((partId) => ({
        design_part_id: partId,
        part_number: partId,
        mpn: null,
      })),
      requirements: [],
      interfaces: [],
      ai_generated: true,
    } as SubsystemSummary;
  });
}

export interface GraphSegmentSummary {
  id: string;
  name: string;
  focus?: string;
  status?: string;
  part_ids: string[];
  requirement_ids: string[];
}

export function graphSegmentsFromData(
  data: Record<string, unknown> | null | undefined,
): GraphSegmentSummary[] {
  const plan = asRecord(data?.graph_segment_plan);
  const rows = Array.isArray(plan?.graph_segments)
    ? plan!.graph_segments
    : Array.isArray(plan?.packages)
      ? plan!.packages
      : [];
  return rows.flatMap((row) => {
    const item = asRecord(row);
    if (!item) return [];
    const id = asString(item.graph_segment_id || item.id || item.work_package_id);
    if (!id) return [];
    return [{
      id,
      name: asString(item.name) || id,
      focus: asString(item.focus) || undefined,
      status: asString(item.status) || undefined,
      part_ids: asStringList(item.part_ids),
      requirement_ids: asStringList(item.requirement_ids),
    }];
  });
}

export function nextGraphSegmentId(data: Record<string, unknown> | null | undefined): string {
  const next = asRecord(data?.next_graph_segment) || asRecord(data?.graph_segment);
  return asString(
    next?.graph_segment_id || next?.id || next?.work_package_id,
  );
}

export interface TgaConnectionProposal {
  id: string;
  source_part_id: string;
  target_part_id: string;
  net_id: string;
  signal_name: string;
  connection_type: string;
  rationale?: string[];
  confidence?: number;
}

export interface TgaPinMappingProposal {
  id: string;
  connection_id: string;
  part_id: string;
  mpn: string;
  pin_name: string;
  pin_number?: string | null;
  signal_name: string;
}

function asTgaConnection(value: unknown): TgaConnectionProposal | null {
  const item = asRecord(value);
  if (!item) return null;
  const id = asString(item.id);
  const source_part_id = asString(item.source_part_id);
  const target_part_id = asString(item.target_part_id);
  if (!id || !source_part_id || !target_part_id) return null;
  return {
    id,
    source_part_id,
    target_part_id,
    net_id: asString(item.net_id),
    signal_name: asString(item.signal_name),
    connection_type: asString(item.connection_type),
    rationale: asStringList(item.rationale),
    confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
  };
}

function asTgaPinMapping(value: unknown): TgaPinMappingProposal | null {
  const item = asRecord(value);
  if (!item) return null;
  const id = asString(item.id);
  const connection_id = asString(item.connection_id);
  const part_id = asString(item.part_id);
  const pin_name = asString(item.pin_name);
  if (!id || !connection_id || !part_id) return null;
  return {
    id,
    connection_id,
    part_id,
    mpn: asString(item.mpn),
    pin_name,
    pin_number: typeof item.pin_number === 'string' ? item.pin_number : null,
    signal_name: asString(item.signal_name),
  };
}

/**
 * Build a map of design-part UUID → display label (MPN) so ghost blocks can
 * show the actual part name instead of the raw UUID.
 *
 * Prefers the authoritative `part_labels` dict sent by the backend (which
 * covers every part referenced in the delta, not just those with pin mappings).
 * Falls back to extracting labels from pin_mappings for older cached responses.
 */
export function partLabelsFromDelta(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const delta = asRecord(data?.proposed_graph_delta);
  if (!delta) return {};

  // Preferred: backend-supplied part_labels dict (UUID → MPN/designator).
  const rawLabels = asRecord(delta.part_labels);
  if (rawLabels && Object.keys(rawLabels).length > 0) {
    const labels: Record<string, string> = {};
    for (const [partId, label] of Object.entries(rawLabels)) {
      const str = asString(label);
      if (partId && str) labels[partId] = str;
    }
    return labels;
  }

  // Fallback: derive labels from pin mappings (only parts with a pin assignment).
  const rawPins = Array.isArray(delta.pin_mappings) ? delta.pin_mappings : [];
  const labels: Record<string, string> = {};
  for (const raw of rawPins) {
    const item = asRecord(raw);
    if (!item) continue;
    const partId = asString(item.part_id);
    const mpn = asString(item.mpn);
    if (partId && mpn) labels[partId] = mpn;
  }
  return labels;
}

export function proposedDeltaConnections(data: Record<string, unknown> | null | undefined): {
  connections: TgaConnectionProposal[];
  pinMappings: TgaPinMappingProposal[];
} {
  const delta = asRecord(data?.proposed_graph_delta);
  if (!delta) return { connections: [], pinMappings: [] };
  const rawConns = Array.isArray(delta.connections) ? delta.connections : [];
  const rawPins = Array.isArray(delta.pin_mappings) ? delta.pin_mappings : [];
  return {
    connections: rawConns.map(asTgaConnection).filter((c): c is TgaConnectionProposal => c != null),
    pinMappings: rawPins.map(asTgaPinMapping).filter((p): p is TgaPinMappingProposal => p != null),
  };
}

export function proposedDeltaSummary(data: Record<string, unknown> | null | undefined) {
  const delta = asRecord(data?.proposed_graph_delta);
  if (!delta) {
    return {
      nets: [] as string[],
      connections: [] as string[],
      pins: [] as string[],
      blockers: [] as string[],
    };
  }
  const stringify = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((row) => {
      if (typeof row === 'string') return row;
      const item = asRecord(row);
      if (!item) return JSON.stringify(row);
      return (
        asString(item.id) ||
        asString(item.name) ||
        asString(item.signal_name) ||
        JSON.stringify(item)
      );
    });
  };
  return {
    nets: stringify(delta.nets_added),
    connections: stringify(delta.connections_added),
    pins: stringify(delta.pin_mappings_added),
    blockers: stringify(delta.blockers_added),
  };
}

export function isTechnicalGraphComplete(envelope: {
  view?: string;
  status?: string;
  data?: Record<string, unknown>;
} | null): boolean {
  if (!envelope) return false;
  if (envelope.status === 'approved') return true;
  const draft = asRecord(envelope.data?.draft_graph);
  if (draft?.status === 'approved') return true;
  const validation = asRecord(envelope.data?.run_validation);
  return (
    envelope.view === 'final_graph_review' &&
    asString(validation?.status) === 'complete'
  );
}

export const PRIMARY_TECHNICAL_GRAPH_ACTIONS = new Set([
  'approve_subsystems',
  'reject_subsystems',
  'approve_graph_segment_plan',
  'reject_graph_segment_plan',
  'start_graph_segment',
  'build_graph_segment',
  'finish_graph_segment',
  'approve_graph_segment',
  'reject_graph_segment',
  'finish_graph',
  'approve_graph',
  'reject_graph',
]);

export const SEGMENT_ACTIONS = new Set([
  'start_graph_segment',
  'build_graph_segment',
  'finish_graph_segment',
  'approve_graph_segment',
  'reject_graph_segment',
  'edit_graph_segment',
  'apply_delta',
]);
