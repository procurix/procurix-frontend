import type { Component } from '@/app/types';
import type { ArchitectureProposalRecord, Connection, ConnectionInferenceSource } from '@/app/services/api';
import type { TgaConnectionProposal, TgaPinMappingProposal } from '@/app/pages/design/utils/technicalGraphMappers';

export type ArchitectureConnectionType =
  | 'power'
  | 'signal'
  | 'data'
  | 'analog'
  | 'differential'
  | 'clock'
  | 'ground'
  | 'switching'
  | 'power_and_feedback'
  | 'feedback'
  | 'control';

const CONNECTION_TYPES = new Set<ArchitectureConnectionType>([
  'power',
  'signal',
  'data',
  'analog',
  'differential',
  'clock',
  'ground',
  'switching',
  'power_and_feedback',
  'feedback',
  'control',
]);

function normalizeConnectionType(value: string | null | undefined): ArchitectureConnectionType {
  const candidate = (value || 'signal').toLowerCase() as ArchitectureConnectionType;
  return CONNECTION_TYPES.has(candidate) ? candidate : 'signal';
}

export interface ArchitectureConnectionData {
  id: string;
  net_id?: string;
  from: string;
  to: string;
  type: ArchitectureConnectionType;
  connection_type?: string;
  signal_name?: string;
  label?: string;
  pins?: string;
  from_pin?: string;
  to_pin?: string;
  source_pin?: string;
  target_pin?: string;
  pin_confidence?: number;
  pin_reasoning?: string;
  pin_resolution_source?: string;
  user_corrected?: boolean;
  reasoning?: string;
  confidence?: number;
  source_requirement_ids?: string[];
  inference_sources?: ConnectionInferenceSource[];
  edgeType?: 'default' | 'straight' | 'step' | 'smoothstep';
  originalConnectionId?: string;
  isVirtualNetSegment?: boolean;
  componentFrom?: string;
  componentTo?: string;
  /** True for ephemeral TGA delta overlay edges — not persisted to the architecture DB. */
  isOverlay?: boolean;
  /** True when this overlay edge belongs to the segment currently under review (amber). False = previous segment (black). */
  isCurrentDelta?: boolean;
}

export interface ArchitectureUnresolvedConnectionCandidate {
  id: string;
  proposal_id?: string;
  source_part: string;
  target_part: string;
  connection_type?: string;
  signal_name?: string;
  source_pin?: string;
  target_pin?: string;
  reasoning?: string;
  confidence?: number;
  pin_resolution_source?: string;
  missing: Array<'source_pin' | 'target_pin'>;
}

export interface ArchitecturePartLookupRow {
  design_part_id?: string | null;
  part_number?: string | null;
  mpn?: string | null;
  component_id?: string | null;
  designator?: string | null;
  category?: string | null;
  classification?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  quantity?: number | null;
  datasheet_url?: string | null;
  specs?: Record<string, unknown> | null;
}

export type ArchitecturePartLookup = Record<string, ArchitecturePartLookupRow>;

function hasPinToPinEndpoints(conn: Connection): boolean {
  return Boolean(conn.source_pin?.trim() && conn.target_pin?.trim());
}

function isActiveConnection(conn: Connection): boolean {
  const status = String(conn.status || '').trim().toLowerCase();
  return status !== 'rejected' && status !== 'deleted';
}

export function extractBaseMpn(partId: string): string {
  const chunks = partId.split('_');
  const last = chunks[chunks.length - 1];
  return chunks.length > 1 && /^\d+$/.test(last) ? chunks.slice(0, -1).join('_') : partId;
}

export function extractInstanceIndex(partId: string): number | null {
  const chunks = partId.split('_');
  const last = chunks[chunks.length - 1];
  return chunks.length > 1 && /^\d+$/.test(last) ? Number.parseInt(last, 10) : null;
}

function lookupRowForPart(partId: string, partLookup?: ArchitecturePartLookup): ArchitecturePartLookupRow | undefined {
  return partLookup?.[partId];
}

function lookupMpn(partId: string, partLookup?: ArchitecturePartLookup): string {
  const row = lookupRowForPart(partId, partLookup);
  return String(row?.mpn || row?.part_number || extractBaseMpn(partId) || partId);
}

export function buildArchitectureComponents(
  connections: Connection[],
  displayedPartIds: string[],
  specsMap: Record<string, Record<string, unknown>>,
  pinoutMap: Record<string, Record<string, { name: string; type: string; description: string }>> = {},
  partLookup?: ArchitecturePartLookup,
): Component[] {
  const uniquePartIds = new Set<string>();
  connections.forEach((conn) => {
    if (conn.source_part) uniquePartIds.add(conn.source_part);
    if (conn.target_part) uniquePartIds.add(conn.target_part);
  });
  displayedPartIds.forEach((partId) => uniquePartIds.add(partId));

  return Array.from(uniquePartIds).map((partId) => {
    const lookup = lookupRowForPart(partId, partLookup);
    const baseMpn = lookupMpn(partId, partLookup);
    const instanceIndex = extractInstanceIndex(partId);
    const specs: Record<string, unknown> = {
      ...(specsMap[baseMpn] ?? {}),
      ...(lookup?.specs ?? {}),
      DesignPartId: lookup?.design_part_id || partId,
      Designator: lookup?.designator || lookup?.component_id || undefined,
    };
    const category = lookup?.category
      || (typeof specs.Category === 'string' ? specs.Category : undefined)
      || 'component';
    const description = lookup?.description
      || (typeof specs.Description === 'string' ? specs.Description : undefined)
      || `Component ${baseMpn}`;
    const reference = lookup?.designator || lookup?.component_id || partId;

    return {
      id: partId,
      reference,
      partNumber: baseMpn,
      manufacturer: lookup?.manufacturer || undefined,
      type: instanceIndex !== null ? `${category} (${instanceIndex})` : category,
      description,
      specs: {
        ...specs,
        ...(instanceIndex !== null ? { Instance: `${instanceIndex} of qty` } : {}),
      },
      pinout: pinoutMap[baseMpn] ?? {},
      isIdentified: true,
      isGeneric: false,
      complianceStatus: 'compliant',
    };
  });
}

function mapApiConnection(conn: Connection, index: number): ArchitectureConnectionData {
  return {
    id: conn.id || `conn-${conn.source_part}-${conn.target_part}-${index}`,
    net_id: conn.net_id || undefined,
    from: conn.source_part,
    to: conn.target_part!,
    type: normalizeConnectionType(conn.connection_type),
    connection_type: conn.connection_type,
    signal_name: conn.signal_name || undefined,
    label: conn.reasoning || undefined,
    reasoning: conn.reasoning || undefined,
    confidence: conn.confidence ?? undefined,
    source_requirement_ids: conn.source_requirement_ids,
    inference_sources: conn.inference_sources,
    from_pin: conn.source_pin || undefined,
    to_pin: conn.target_pin || undefined,
    source_pin: conn.source_pin || undefined,
    target_pin: conn.target_pin || undefined,
    pin_confidence: conn.pin_confidence ?? undefined,
    pin_reasoning: conn.pin_reasoning || undefined,
    pin_resolution_source: conn.pin_resolution_source || undefined,
    user_corrected: Boolean(conn.user_corrected),
    edgeType: 'smoothstep',
  };
}

export function mapApiConnections(connections: Connection[]): ArchitectureConnectionData[] {
  return connections
    .filter((conn) => conn.target_part !== null && isActiveConnection(conn) && hasPinToPinEndpoints(conn))
    .map(mapApiConnection);
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function mapUnresolvedProposalConnections(
  proposals: ArchitectureProposalRecord[],
): ArchitectureUnresolvedConnectionCandidate[] {
  return proposals
    .filter((proposal) => proposal.proposal_type === 'unresolved_connection' || proposal.action === 'unresolved_connection')
    .filter((proposal) => proposal.status === 'pending' || !proposal.status)
    .map((proposal, index) => {
      const payload = proposal.payload || {};
      const sourcePin = readString(payload, 'source_pin');
      const targetPin = readString(payload, 'target_pin');
      const missing: Array<'source_pin' | 'target_pin'> = [];
      if (!sourcePin) missing.push('source_pin');
      if (!targetPin) missing.push('target_pin');

      return {
        id: proposal.id || `unresolved-proposal-${index}`,
        proposal_id: proposal.id,
        source_part: readString(payload, 'source_mpn') || readString(payload, 'source_part') || 'Unknown source',
        target_part: readString(payload, 'target_mpn') || readString(payload, 'target_part') || 'Unknown target',
        connection_type: readString(payload, 'connection_type'),
        signal_name: readString(payload, 'signal_name'),
        source_pin: sourcePin,
        target_pin: targetPin,
        reasoning: readString(payload, 'pin_reasoning') || readString(payload, 'reasoning') || proposal.rationale || undefined,
        confidence: typeof payload.confidence === 'number' ? payload.confidence : proposal.confidence ?? undefined,
        pin_resolution_source: readString(payload, 'pin_resolution_source') || 'unresolved',
        missing,
      };
    });
}

/**
 * Convert TGA ConnectionProposal + PinMappingProposal arrays into
 * ArchitectureConnectionData[] for overlay rendering on the React Flow canvas.
 * Overlay edges are ephemeral — they are never persisted to the architecture DB.
 */
export function mapTgaConnections(
  connections: TgaConnectionProposal[],
  pinMappings: TgaPinMappingProposal[],
): ArchitectureConnectionData[] {
  return connections.map((conn) => {
    const sourcePm = pinMappings.find(
      (pm) => pm.connection_id === conn.id && pm.part_id === conn.source_part_id,
    );
    const targetPm = pinMappings.find(
      (pm) => pm.connection_id === conn.id && pm.part_id === conn.target_part_id,
    );
    return {
      id: conn.id,
      from: conn.source_part_id,
      to: conn.target_part_id,
      net_id: conn.net_id || undefined,
      type: normalizeConnectionType(conn.connection_type),
      connection_type: conn.connection_type || undefined,
      signal_name: conn.signal_name || undefined,
      from_pin: sourcePm?.pin_name || undefined,
      to_pin: targetPm?.pin_name || undefined,
      edgeType: 'smoothstep',
      isOverlay: true,
    };
  });
}

export function buildSaveConnectionPayload(connections: ArchitectureConnectionData[]): Connection[] {
  return connections
    .filter((conn) => conn.from && conn.to && (conn.source_pin || conn.from_pin) && (conn.target_pin || conn.to_pin))
    .map((conn) => ({
      source_part: conn.from,
      target_part: conn.to,
      connection_type: conn.type || conn.connection_type || 'signal',
      signal_name: conn.signal_name,
      reasoning: conn.reasoning,
      confidence: conn.confidence,
      source_requirement_ids: conn.source_requirement_ids,
      inference_sources: conn.inference_sources,
      net_id: conn.net_id,
      source_pin: conn.source_pin || conn.from_pin,
      target_pin: conn.target_pin || conn.to_pin,
      pin_confidence: conn.pin_confidence,
      pin_reasoning: conn.pin_reasoning,
      pin_resolution_source: conn.pin_resolution_source,
      user_corrected: conn.user_corrected,
    }));
}
