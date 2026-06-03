import type { ComponentBlock } from '../components/SystemArchitectureView';

export interface ConnectionData {
  id: string;
  from: string;
  to: string;
  type: string;
}

export type LayoutType = 'random';

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface RoutedLayoutResult {
  blocks: ComponentBlock[];
  edgeRoutes: Record<string, LayoutPoint[]>;
}

const NODE_W = 390;
const NODE_H = 260;   // safe upper-bound for collapsed node height
const NET_NODE_W = 136;
const NET_NODE_H = 48;
const GAP_X = 260;    // horizontal gap between layers
const GAP_Y = 120;    // vertical gap between nodes in the same layer
const MAX_ELK_NODES = 80;
const MAX_ELK_EDGES = 240;
const ELK_LAYOUT_TIMEOUT_MS = 4500;

type ElkInstance = {
  layout: (graph: unknown) => Promise<{
    children?: Array<{ id: string; x?: number; y?: number }>;
    edges?: Array<{
      id: string;
      sections?: Array<{
        startPoint?: LayoutPoint;
        bendPoints?: LayoutPoint[];
        endPoint?: LayoutPoint;
      }>;
    }>;
  }>;
};

function getLayoutSize(block: ComponentBlock): { width: number; height: number } {
  if (block.specs?.isVirtualNet) {
    return { width: NET_NODE_W, height: NET_NODE_H };
  }
  return { width: NODE_W, height: NODE_H };
}

let elkInstancePromise: Promise<ElkInstance> | null = null;

async function getElkInstance(): Promise<ElkInstance> {
  if (!elkInstancePromise) {
    elkInstancePromise = import('elkjs/lib/elk.bundled.js').then(
      ({ default: ELK }) => new ELK() as unknown as ElkInstance,
    );
  }
  return await elkInstancePromise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`ELK layout exceeded ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

function sortLayerBlocks(
  layerBlocks: ComponentBlock[],
  outEdges: Map<string, string[]>,
  inDeg: Map<string, number>,
): ComponentBlock[] {
  return [...layerBlocks].sort((a, b) => {
    const degreeA = (outEdges.get(a.id)?.length ?? 0) + (inDeg.get(a.id) ?? 0);
    const degreeB = (outEdges.get(b.id)?.length ?? 0) + (inDeg.get(b.id) ?? 0);
    if (degreeA !== degreeB) return degreeB - degreeA;

    const categoryA = String(a.specs?.Category || a.category || a.type || '');
    const categoryB = String(b.specs?.Category || b.category || b.type || '');
    return categoryA.localeCompare(categoryB) || String(a.partNumber || a.id).localeCompare(String(b.partNumber || b.id));
  });
}

/**
 * Topological layer layout.
 *
 * Assigns each node to a "layer" (column) by BFS distance from sources
 * (nodes with no incoming edges). Nodes in the same layer are distributed
 * vertically. Isolated nodes (no connections) go into a final row below.
 *
 * Result: clean left-to-right signal-flow diagram, no overlaps, deterministic.
 */
function topologicalLayout(
  blocks: ComponentBlock[],
  connections: ConnectionData[],
): ComponentBlock[] {
  if (blocks.length === 0) return blocks;

  // Build directed adjacency + in-degree map
  const outEdges = new Map<string, string[]>();
  const inDeg    = new Map<string, number>();
  blocks.forEach(b => { outEdges.set(b.id, []); inDeg.set(b.id, 0); });

  connections.forEach(c => {
    if (outEdges.has(c.from) && outEdges.has(c.to)) {
      outEdges.get(c.from)!.push(c.to);
      inDeg.set(c.to, (inDeg.get(c.to) ?? 0) + 1);
    }
  });

  // Layer assignment via BFS from sources
  const layerOf = new Map<string, number>();

  const sources = blocks
    .filter(b => (inDeg.get(b.id) ?? 0) === 0 && (outEdges.get(b.id)?.length ?? 0) > 0)
    .map(b => b.id);

  // If no clear sources (all cycles), seed from the highest-degree node
  const seeds = sources.length
    ? sources
    : [blocks.reduce((best, b) =>
        (outEdges.get(b.id)?.length ?? 0) > (outEdges.get(best.id)?.length ?? 0) ? b : best
      ).id];

  seeds.forEach(id => layerOf.set(id, 0));
  let frontier = seeds;

  const settled = new Set<string>(seeds);

  while (frontier.length > 0) {
    const next: string[] = [];
    frontier.forEach(id => {
      const currentLayer = layerOf.get(id) ?? 0;
      (outEdges.get(id) ?? []).forEach(nId => {
        // Electrical graphs often contain cycles. Assign each node once so a
        // feedback path cannot keep increasing layer numbers forever.
        if (!settled.has(nId)) {
          layerOf.set(nId, currentLayer + 1);
          settled.add(nId);
          next.push(nId);
        }
      });
    });
    frontier = next;
  }

  // Group: connected nodes by layer, isolated nodes separate
  const byLayer = new Map<number, ComponentBlock[]>();
  const isolated: ComponentBlock[] = [];

  blocks.forEach(b => {
    const isIsolated =
      (inDeg.get(b.id) ?? 0) === 0 &&
      (outEdges.get(b.id)?.length ?? 0) === 0;

    if (isIsolated) {
      isolated.push(b);
      return;
    }
    const l = layerOf.get(b.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(b);
  });

  const result: ComponentBlock[] = [];

  // Place connected nodes layer by layer (left to right)
  const layerNums = [...byLayer.keys()].sort((a, b) => a - b);
  const layerHeight = (count: number) => count * (NODE_H + GAP_Y) - GAP_Y;

  layerNums.forEach(l => {
    const layerBlocks = sortLayerBlocks(byLayer.get(l)!, outEdges, inDeg);
    const totalH = layerHeight(layerBlocks.length);
    layerBlocks.forEach((block, i) => {
      result.push({
        ...block,
        x: l * (NODE_W + GAP_X),
        y: i * (NODE_H + GAP_Y) - totalH / 2,
      });
    });
  });

  // Place isolated nodes in a row below the connected graph
  if (isolated.length > 0) {
    const maxLayer = layerNums.length > 0 ? Math.max(...layerNums) : 0;
    const maxLayerSize = layerNums.reduce(
      (m, l) => Math.max(m, byLayer.get(l)!.length), 0,
    );
    const bottomY = (maxLayerSize / 2 + 1) * (NODE_H + GAP_Y);

    isolated.forEach((block, i) => {
      result.push({
        ...block,
        x: i * (NODE_W + GAP_X),
        y: bottomY + NODE_H + GAP_Y * 2,
      });
    });
    void maxLayer; // used implicitly via layerNums
  }

  return result;
}

function centerBlocksInViewport(blocks: ComponentBlock[]): ComponentBlock[] {
  if (blocks.length === 0) return blocks;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  blocks.forEach(b => {
    const size = getLayoutSize(b);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + size.width);
    maxY = Math.max(maxY, b.y + size.height);
  });

  const offsetX = 800 - (minX + maxX) / 2;
  const offsetY = 500 - (minY + maxY) / 2;

  return blocks.map(b => ({ ...b, x: b.x + offsetX, y: b.y + offsetY }));
}

function getCenterOffset(blocks: ComponentBlock[]): LayoutPoint {
  if (blocks.length === 0) return { x: 0, y: 0 };

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  blocks.forEach(b => {
    const size = getLayoutSize(b);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + size.width);
    maxY = Math.max(maxY, b.y + size.height);
  });

  return {
    x: 800 - (minX + maxX) / 2,
    y: 500 - (minY + maxY) / 2,
  };
}

function applyOffsetToBlocks(blocks: ComponentBlock[], offset: LayoutPoint): ComponentBlock[] {
  return blocks.map((block) => ({ ...block, x: block.x + offset.x, y: block.y + offset.y }));
}

function applyOffsetToRoutes(routes: Record<string, LayoutPoint[]>, offset: LayoutPoint): Record<string, LayoutPoint[]> {
  return Object.fromEntries(
    Object.entries(routes).map(([id, points]) => [
      id,
      points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
    ]),
  );
}

export function applyLayout(
  _layoutType: LayoutType,
  blocks: ComponentBlock[],
  connections: ConnectionData[],
): ComponentBlock[] {
  return centerBlocksInViewport(topologicalLayout(blocks, connections));
}

export async function applyElkLayout(
  blocks: ComponentBlock[],
  connections: ConnectionData[],
): Promise<ComponentBlock[]> {
  const result = await applyElkRoutedLayout(blocks, connections);
  return result.blocks;
}

export async function applyElkRoutedLayout(
  blocks: ComponentBlock[],
  connections: ConnectionData[],
): Promise<RoutedLayoutResult> {
  if (blocks.length === 0) return { blocks, edgeRoutes: {} };
  if (blocks.length > MAX_ELK_NODES || connections.length > MAX_ELK_EDGES) {
    return { blocks: applyLayout('random', blocks, connections), edgeRoutes: {} };
  }

  const elk = await getElkInstance();
  const blockIds = new Set(blocks.map((block) => block.id));
  const graph = {
    id: 'architecture',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '260',
      'elk.spacing.nodeNode': '120',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.unnecessaryBendpoints': 'true',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.spacing.edgeNodeBetweenLayers': '72',
      'elk.spacing.edgeNode': '36',
      'elk.spacing.edgeEdge': '18',
    },
    children: blocks.map((block) => ({
      id: block.id,
      ...getLayoutSize(block),
    })),
    edges: connections
      .filter((connection) => blockIds.has(connection.from) && blockIds.has(connection.to))
      .map((connection) => ({
        id: connection.id,
        sources: [connection.from],
        targets: [connection.to],
      })),
  };

  const layout = await withTimeout(elk.layout(graph), ELK_LAYOUT_TIMEOUT_MS);
  const positions = new Map(
    (layout.children ?? []).map((child) => [
      child.id,
      { x: Number(child.x ?? 0), y: Number(child.y ?? 0) },
    ]),
  );

  const laidOutBlocks = blocks.map((block) => {
    const position = positions.get(block.id);
    return position ? { ...block, x: position.x, y: position.y } : block;
  });

  const edgeRoutes = Object.fromEntries(
    (layout.edges ?? []).flatMap((edge) => {
      const section = edge.sections?.[0];
      if (!section?.startPoint || !section.endPoint) return [];
      return [[
        edge.id,
        [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ],
      ]];
    }),
  );

  const offset = getCenterOffset(laidOutBlocks);

  return {
    blocks: applyOffsetToBlocks(laidOutBlocks, offset),
    edgeRoutes: applyOffsetToRoutes(edgeRoutes, offset),
  };
}
