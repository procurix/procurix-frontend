import type { LayoutPoint } from './layoutAlgorithms';

const STORAGE_PREFIX = 'architecture-layout:v1:';

export interface PersistableLayoutBlock {
  id: string;
  x: number;
  y: number;
}

export interface LayoutNodePosition {
  x: number;
  y: number;
}

export interface ArchitectureLayoutMetadata {
  version: 1;
  scopeId: string;
  updatedAt: string;
  nodes: Record<string, LayoutNodePosition>;
  virtualNets: Record<string, LayoutNodePosition>;
  waypoints: Record<string, LayoutPoint[]>;
}

function storageKey(scopeId: string): string {
  return `${STORAGE_PREFIX}${scopeId}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isPosition(value: unknown): value is LayoutNodePosition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LayoutNodePosition>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function sanitizePositions(value: unknown): Record<string, LayoutNodePosition> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, LayoutNodePosition] => isPosition(entry[1]))
      .map(([id, position]) => [id, { x: position.x, y: position.y }]),
  );
}

export function loadArchitectureLayoutMetadata(scopeId?: string | null): ArchitectureLayoutMetadata | null {
  if (!scopeId || !canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(scopeId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ArchitectureLayoutMetadata>;
    if (parsed.version !== 1) return null;

    return {
      version: 1,
      scopeId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      nodes: sanitizePositions(parsed.nodes),
      virtualNets: sanitizePositions(parsed.virtualNets),
      waypoints: parsed.waypoints && typeof parsed.waypoints === 'object'
        ? parsed.waypoints as Record<string, LayoutPoint[]>
        : {},
    };
  } catch {
    return null;
  }
}

export function saveArchitectureLayoutMetadata(
  scopeId: string | null | undefined,
  metadata: ArchitectureLayoutMetadata,
): void {
  if (!scopeId || !canUseStorage()) return;
  try {
    window.localStorage.setItem(storageKey(scopeId), JSON.stringify(metadata));
  } catch {
    // Layout persistence is a UX enhancement; rendering must not depend on it.
  }
}

export function applyPersistedPositions<T extends PersistableLayoutBlock>(
  blocks: T[],
  positions?: Record<string, LayoutNodePosition>,
): T[] {
  if (!positions || Object.keys(positions).length === 0) return blocks;
  return blocks.map((block) => {
    const position = positions[block.id];
    return position ? { ...block, x: position.x, y: position.y } : block;
  });
}

export function buildArchitectureLayoutMetadata<T extends PersistableLayoutBlock>(
  scopeId: string,
  componentBlocks: T[],
  virtualNetBlocks: T[],
  previous?: ArchitectureLayoutMetadata | null,
): ArchitectureLayoutMetadata {
  const nodes = Object.fromEntries(
    componentBlocks.map((block) => [block.id, { x: block.x, y: block.y }]),
  );
  const virtualNets = Object.fromEntries(
    virtualNetBlocks.map((block) => [block.id, { x: block.x, y: block.y }]),
  );

  return {
    version: 1,
    scopeId,
    updatedAt: new Date().toISOString(),
    nodes,
    virtualNets,
    waypoints: previous?.waypoints ?? {},
  };
}
