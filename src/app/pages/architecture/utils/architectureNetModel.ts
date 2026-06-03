import type { ArchitectureNet } from '@/app/services/api';
import type { ComponentBlock } from '../components/SystemArchitectureView';
import type { ArchitectureConnectionData as ConnectionData } from './connectionMapping';

export const VIRTUAL_NET_PREFIX = 'net:';
export const VIRTUAL_NET_SOURCE_HANDLE = 'net-source';
export const VIRTUAL_NET_TARGET_HANDLE = 'net-target';

const SHARED_NET_TYPES = new Set([
  'power',
  'ground',
  'data',
  'clock',
  'control',
  'signal',
  'analog',
  'differential',
  'switching',
  'power_and_feedback',
  'feedback',
]);
const GENERIC_SIGNALS = new Set(['', 'power', 'signal', 'data', 'control', 'connection', 'net']);
const HIDDEN_NET_STATUSES = new Set(['hidden', 'rejected', 'ungrouped']);

export interface ArchitectureNetModel {
  virtualNetBlocks: ComponentBlock[];
  renderConnections: ConnectionData[];
  compactedConnectionCount: number;
}

export function sanitizeNetId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeNetLabel(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeRailSignal(signal: string): string {
  const compact = signal.toLowerCase().replace(/[^a-z0-9.+-]/g, '');
  if (/^(gnd|ground|agnd|dgnd|pgnd)$/.test(compact)) return 'GND';
  if (/(vdd|vcc|vout|rail)?3[._-]?3v|3v3|3\.3v/.test(compact)) return '3V3';
  if (/(vdd|vcc|vout|rail)?5[._-]?0?v|5v0|5v/.test(compact)) return '5V';
  if (/(vbat|battery|bat)/.test(compact)) return 'VBAT';
  return '';
}

function normalizeProtocolSignal(signal: string): string {
  const upper = signal.toUpperCase();
  const protocol = upper.match(/\b(CAN|LIN|SPI|I2C|UART|USB|SDIO|JTAG|SWD)(\d*)\b/);
  if (!protocol) return '';
  const [, name, index] = protocol;
  return `${name}${index || ''}`;
}

function getNetKey(connection: ConnectionData): { key: string; label: string; type: string } | null {
  const signal = String(connection.signal_name || connection.label || '').trim();
  const type = String(connection.connection_type || connection.type || 'signal').toLowerCase();
  const lowerSignal = signal.toLowerCase();
  const rail = normalizeRailSignal(signal);
  const protocol = normalizeProtocolSignal(signal);

  if (rail) {
    return { key: `${type}:${rail.toLowerCase()}`, label: rail, type: rail === 'GND' ? 'ground' : 'power' };
  }

  if (protocol) {
    return { key: `${type}:${protocol.toLowerCase()}`, label: protocol, type };
  }

  if (!GENERIC_SIGNALS.has(lowerSignal) && SHARED_NET_TYPES.has(type)) {
    return {
      key: `${type}:${sanitizeNetId(signal)}`,
      label: normalizeNetLabel(signal),
      type,
    };
  }

  return null;
}

function getLayoutNumber(layout: Record<string, unknown> | null | undefined, key: 'x' | 'y'): number | undefined {
  const value = layout?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function createVirtualNetBlock(
  netId: string,
  netKey: string,
  label: string,
  type: string,
  connections: ConnectionData[],
  blocksById: Map<string, ComponentBlock>,
  persistedNet?: ArchitectureNet,
): ComponentBlock {
  const connectedBlocks = connections.flatMap((connection) => [
    blocksById.get(connection.from),
    blocksById.get(connection.to),
  ]).filter(Boolean) as ComponentBlock[];

  const avgX = connectedBlocks.length
    ? connectedBlocks.reduce((sum, block) => sum + block.x, 0) / connectedBlocks.length
    : 0;
  const avgY = connectedBlocks.length
    ? connectedBlocks.reduce((sum, block) => sum + block.y, 0) / connectedBlocks.length
    : 0;
  const x = getLayoutNumber(persistedNet?.layout, 'x') ?? avgX;
  const y = getLayoutNumber(persistedNet?.layout, 'y') ?? avgY;

  return {
    id: netId,
    reference: label,
    partNumber: label,
    type: 'virtual_net',
    description: `${label} shared ${type} net`,
    specs: {
      Category: 'Virtual Net',
      isVirtualNet: true,
      isPersistedNet: Boolean(persistedNet),
      netId: persistedNet?.id,
      netKey,
      netType: type,
      netStatus: persistedNet?.status,
      netKind: type === 'power' || type === 'ground' ? 'rail' : 'bus',
      connectionCount: connections.length,
    },
    isIdentified: true,
    isGeneric: false,
    complianceStatus: 'unknown',
    x,
    y,
    connections: connections.map((connection) => connection.id),
    category: 'Virtual Net',
  };
}

function toNetSegments(connection: ConnectionData, netId: string, label: string): ConnectionData[] {
  const sourceSegment: ConnectionData = {
    ...connection,
    id: `${connection.id}:source-net`,
    to: netId,
    label,
    signal_name: label,
    target_pin: undefined,
    to_pin: undefined,
    edgeType: 'smoothstep',
    originalConnectionId: connection.id,
    isVirtualNetSegment: true,
    componentFrom: connection.from,
    componentTo: connection.to,
  };

  const targetSegment: ConnectionData = {
    ...connection,
    id: `${connection.id}:net-target`,
    from: netId,
    label,
    signal_name: label,
    source_pin: undefined,
    from_pin: undefined,
    edgeType: 'smoothstep',
    originalConnectionId: connection.id,
    isVirtualNetSegment: true,
    componentFrom: connection.from,
    componentTo: connection.to,
  };

  return [sourceSegment, targetSegment];
}

export function isVirtualNetId(id: string | undefined): boolean {
  return Boolean(id?.startsWith(VIRTUAL_NET_PREFIX));
}

export function persistedNetNodeId(netId: string): string {
  return VIRTUAL_NET_PREFIX + sanitizeNetId(netId);
}

function buildPersistedNetModel(
  blocksById: Map<string, ComponentBlock>,
  connections: ConnectionData[],
  persistedNets: ArchitectureNet[],
): ArchitectureNetModel {
  const connectionToNet = new Map<string, { netId: string; label: string }>();
  const virtualNetBlocks: ComponentBlock[] = [];

  for (const net of persistedNets) {
    const status = String(net.status || '').toLowerCase();
    if (HIDDEN_NET_STATUSES.has(status)) continue;

    const memberIds = new Set<string>(net.member_connection_ids || []);
    for (const member of net.members || []) {
      if (member.id) memberIds.add(member.id);
    }

    const members = connections.filter((connection) => (
      connection.net_id === net.id || memberIds.has(connection.id)
    ));
    const validMembers = members.filter((connection) => (
      blocksById.has(connection.from) && blocksById.has(connection.to)
    ));

    const label = net.name || validMembers[0]?.signal_name || validMembers[0]?.label || 'Net';
    const type = net.net_type || validMembers[0]?.connection_type || validMembers[0]?.type || 'signal';
    const netNodeId = persistedNetNodeId(net.id);
    virtualNetBlocks.push(createVirtualNetBlock(netNodeId, net.id, label, type, validMembers, blocksById, net));
    validMembers.forEach((connection) => {
      connectionToNet.set(connection.id, { netId: netNodeId, label });
    });
  }

  const renderConnections = connections.flatMap((connection) => {
    const net = connectionToNet.get(connection.id);
    return net ? toNetSegments(connection, net.netId, net.label) : [connection];
  });

  return {
    virtualNetBlocks,
    renderConnections,
    compactedConnectionCount: connectionToNet.size,
  };
}

export function buildArchitectureNetModel(
  blocks: ComponentBlock[],
  connections: ConnectionData[],
  hiddenNetKeys: Set<string> = new Set(),
  persistedNets: ArchitectureNet[] = [],
): ArchitectureNetModel {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  if (persistedNets.length > 0) {
    return buildPersistedNetModel(blocksById, connections, persistedNets);
  }

  const candidateGroups = new Map<string, {
    label: string;
    type: string;
    connections: ConnectionData[];
  }>();

  for (const connection of connections) {
    if (!blocksById.has(connection.from) || !blocksById.has(connection.to)) continue;
    const net = getNetKey(connection);
    if (!net) continue;
    if (!candidateGroups.has(net.key)) {
      candidateGroups.set(net.key, { label: net.label, type: net.type, connections: [] });
    }
    candidateGroups.get(net.key)!.connections.push(connection);
  }

  const eligibleNets = new Map(
    [...candidateGroups.entries()].filter(([key, group]) => (
      group.connections.length >= 2 && !hiddenNetKeys.has(key)
    )),
  );

  if (eligibleNets.size === 0) {
    return {
      virtualNetBlocks: [],
      renderConnections: connections,
      compactedConnectionCount: 0,
    };
  }

  const connectionToNet = new Map<string, { netId: string; label: string }>();
  const virtualNetBlocks: ComponentBlock[] = [];

  for (const [key, group] of eligibleNets.entries()) {
    const netId = `${VIRTUAL_NET_PREFIX}${sanitizeNetId(key)}`;
    virtualNetBlocks.push(createVirtualNetBlock(netId, key, group.label, group.type, group.connections, blocksById));
    group.connections.forEach((connection) => {
      connectionToNet.set(connection.id, { netId, label: group.label });
    });
  }

  const renderConnections = connections.flatMap((connection) => {
    const net = connectionToNet.get(connection.id);
    return net ? toNetSegments(connection, net.netId, net.label) : [connection];
  });

  return {
    virtualNetBlocks,
    renderConnections,
    compactedConnectionCount: connectionToNet.size,
  };
}



