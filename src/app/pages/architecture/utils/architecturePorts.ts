import type { ComponentBlock } from '../components/SystemArchitectureView';
import type { ArchitectureConnectionData as ConnectionData } from './connectionMapping';

export interface PinOption {
  value: string;
  label: string;
  name: string;
  number: string;
}

export function normalizePinName(pinName?: string | null): string {
  return String(pinName || '').trim().toLowerCase();
}

export function resolvePinHandleId(block: ComponentBlock | undefined, pinName?: string | null): string | undefined {
  if (!block || !pinName || !block.pinout) return undefined;
  const normalized = normalizePinName(pinName);
  if (!normalized) return undefined;
  for (const [pinNumber, pinData] of Object.entries(block.pinout)) {
    if (normalizePinName(pinData.name) === normalized || normalizePinName(pinNumber) === normalized) {
      return `${block.id}-pin-${pinNumber}`;
    }
  }
  const pinMatch = pinName.match(/\bpin\s*[-#:]*\s*([a-z0-9]+)\b/i);
  const pinNumber = pinMatch?.[1];
  return pinNumber && block.pinout[pinNumber] ? `${block.id}-pin-${pinNumber}` : undefined;
}

export function isHandleOwnedByNode(nodeId: string | null | undefined, handleId: string | null | undefined): boolean {
  if (!nodeId || !handleId) return false;
  return handleId === 'default' || handleId.startsWith(`${nodeId}-`);
}

export function getPinValueFromHandle(
  block: ComponentBlock | undefined,
  handleId: string | null | undefined,
): string | undefined {
  if (!block || !handleId || !isHandleOwnedByNode(block.id, handleId)) return undefined;
  const prefix = `${block.id}-pin-`;
  if (!handleId.startsWith(prefix)) return undefined;
  const pinNumber = handleId.slice(prefix.length);
  const pin = block.pinout?.[pinNumber];
  if (!pin?.name) return `Pin ${pinNumber}`;
  const duplicateCount = Object.values(block.pinout || {}).filter(
    (candidate) => normalizePinName(candidate.name) === normalizePinName(pin.name),
  ).length;
  return duplicateCount > 1 ? `Pin ${pinNumber}` : pin.name;
}

export function getPinOptions(block: ComponentBlock | undefined): PinOption[] {
  if (!block?.pinout) return [];
  const entries = Object.entries(block.pinout);
  const nameCounts = entries.reduce((counts, [, pin]) => {
    const name = pin.name || 'Unnamed';
    counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  return entries.map(([number, pin]) => {
    const name = pin.name || 'Unnamed';
    const duplicateName = (nameCounts.get(name) || 0) > 1;
    return {
      value: duplicateName ? `Pin ${number}` : name,
      label: `${number} ${name}${pin.type ? ` (${pin.type.toLowerCase()})` : ''}`,
      name,
      number,
    };
  });
}

export function getPinSelectValue(
  block: ComponentBlock | undefined,
  value: string | null | undefined,
): string {
  if (!value) return '';
  const normalized = normalizePinName(value);
  const option = getPinOptions(block).find((pin) => (
    normalizePinName(pin.value) === normalized ||
    normalizePinName(pin.name) === normalized ||
    normalizePinName(pin.number) === normalized
  ));
  return option?.value || value;
}

export function buildActivePinsByBlock(connections: ConnectionData[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (blockId: string | undefined, pinName: string | undefined) => {
    if (!blockId || !pinName) return;
    if (!map.has(blockId)) map.set(blockId, new Set());
    map.get(blockId)!.add(pinName);
  };

  connections.forEach((connection) => {
    add(connection.from, connection.source_pin || connection.from_pin);
    add(connection.to, connection.target_pin || connection.to_pin);
  });

  return map;
}
