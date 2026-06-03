import type { LayoutPoint } from './layoutAlgorithms';
import type { ComponentBlock } from '../components/SystemArchitectureView';
import { isVirtualNetId } from './architectureNetModel';
import { resolvePinHandleId } from './architecturePorts';
import type { ArchitectureConnectionData as ConnectionData } from './connectionMapping';

export interface RouteRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type RouteKind = 'direct' | 'part-to-net' | 'net-to-part' | 'net-to-net';

export interface RoutePlan {
  routeKind: RouteKind;
  sourceRect?: RouteRect;
  targetRect?: RouteRect;
  sourcePoint?: LayoutPoint;
  targetPoint?: LayoutPoint;
  sourceSide?: PortSide;
  targetSide?: PortSide;
  obstacles: RouteRect[];
  points?: LayoutPoint[];
  preferredLaneY?: number;
  preferredLaneX?: number;
}

const COMPONENT_W = 390;
const COMPONENT_H = 260;
const NET_W = 136;
const NET_H = 48;
const ESCAPE_CLEARANCE = 44;
const OBSTACLE_MARGIN = 18;
const BUNDLE_SPACING = 24;

function getNodeRect(block: ComponentBlock): RouteRect {
  const isNet = isVirtualNetId(block.id);
  return {
    id: block.id,
    x: block.x,
    y: block.y,
    width: isNet ? NET_W : COMPONENT_W,
    height: isNet ? NET_H : COMPONENT_H,
  };
}

function center(rect: RouteRect): LayoutPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function expandRect(rect: RouteRect, margin: number): RouteRect {
  return {
    ...rect,
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function classifyRoute(connection: ConnectionData): RouteKind {
  const sourceIsNet = isVirtualNetId(connection.from);
  const targetIsNet = isVirtualNetId(connection.to);
  if (sourceIsNet && targetIsNet) return 'net-to-net';
  if (sourceIsNet) return 'net-to-part';
  if (targetIsNet) return 'part-to-net';
  return 'direct';
}

function nearestSide(point: LayoutPoint, rect: RouteRect): PortSide {
  const distances = [
    { side: 'left' as const, value: Math.abs(point.x - rect.x) },
    { side: 'right' as const, value: Math.abs(point.x - (rect.x + rect.width)) },
    { side: 'top' as const, value: Math.abs(point.y - rect.y) },
    { side: 'bottom' as const, value: Math.abs(point.y - (rect.y + rect.height)) },
  ];
  return distances.sort((a, b) => a.value - b.value)[0].side;
}

function sideFacing(from: RouteRect, to: RouteRect): PortSide {
  const fromCenter = center(from);
  const toCenter = center(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function pointOnSide(rect: RouteRect, side: PortSide, toward?: RouteRect): LayoutPoint {
  const rectCenter = center(rect);
  const towardCenter = toward ? center(toward) : rectCenter;
  const clampedY = Math.min(rect.y + rect.height - 16, Math.max(rect.y + 16, towardCenter.y));
  const clampedX = Math.min(rect.x + rect.width - 16, Math.max(rect.x + 16, towardCenter.x));

  if (side === 'left') return { x: rect.x, y: clampedY };
  if (side === 'right') return { x: rect.x + rect.width, y: clampedY };
  if (side === 'top') return { x: clampedX, y: rect.y };
  return { x: clampedX, y: rect.y + rect.height };
}

function escapePoint(point: LayoutPoint, side: PortSide, clearance = ESCAPE_CLEARANCE): LayoutPoint {
  if (side === 'left') return { x: point.x - clearance, y: point.y };
  if (side === 'right') return { x: point.x + clearance, y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - clearance };
  return { x: point.x, y: point.y + clearance };
}

function routePairKey(connection: ConnectionData, routeKind: RouteKind): string {
  if (routeKind === 'direct') {
    return [connection.from, connection.to].sort().join('<>');
  }
  return `${routeKind}:${connection.from}->${connection.to}`;
}

function bundleOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * BUNDLE_SPACING;
}

function segmentIntersectsRect(a: LayoutPoint, b: LayoutPoint, rect: RouteRect): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y >= top && a.y <= bottom && maxX >= left && minX <= right;
  }

  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x >= left && a.x <= right && maxY >= top && minY <= bottom;
  }

  return false;
}

function simplifyPoints(points: LayoutPoint[]): LayoutPoint[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const prev = points[index - 1];
    const next = points[index + 1];
    const duplicate = point.x === prev.x && point.y === prev.y;
    const horizontal = prev.y === point.y && point.y === next.y;
    const vertical = prev.x === point.x && point.x === next.x;
    return !duplicate && !horizontal && !vertical;
  });
}

function manhattanLength(points: LayoutPoint[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x);
    total += Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

function obstaclePenalty(points: LayoutPoint[], obstacles: RouteRect[]): number {
  let penalty = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (a.x === b.x && a.y === b.y) continue;
    penalty += obstacles.filter((rect) => segmentIntersectsRect(a, b, rect)).length;
  }
  return penalty;
}

function chooseRoute(
  sourcePoint: LayoutPoint,
  sourceOut: LayoutPoint,
  targetOut: LayoutPoint,
  targetPoint: LayoutPoint,
  sourceRect: RouteRect,
  targetRect: RouteRect,
  obstacles: RouteRect[],
  sourceSide: PortSide,
  targetSide: PortSide,
  offset: number,
): { points: LayoutPoint[]; laneY?: number; laneX?: number } {
  const preferHorizontal = (
    sourceSide === 'left' ||
    sourceSide === 'right' ||
    targetSide === 'left' ||
    targetSide === 'right' ||
    Math.abs(center(targetRect).x - center(sourceRect).x) >= Math.abs(center(targetRect).y - center(sourceRect).y)
  );

  const midY = (sourceOut.y + targetOut.y) / 2 + offset;
  const midX = (sourceOut.x + targetOut.x) / 2 + offset;
  const expandedObstacles = obstacles.map((rect) => expandRect(rect, OBSTACLE_MARGIN));

  const yCandidates = new Set<number>([
    midY,
    sourceOut.y + offset,
    targetOut.y + offset,
  ]);
  const xCandidates = new Set<number>([
    midX,
    sourceOut.x + offset,
    targetOut.x + offset,
  ]);

  expandedObstacles.forEach((rect) => {
    yCandidates.add(rect.y - ESCAPE_CLEARANCE + offset);
    yCandidates.add(rect.y + rect.height + ESCAPE_CLEARANCE + offset);
    xCandidates.add(rect.x - ESCAPE_CLEARANCE + offset);
    xCandidates.add(rect.x + rect.width + ESCAPE_CLEARANCE + offset);
  });

  const candidates = [
    ...[...yCandidates].map((laneY) => {
      const points = simplifyPoints([
        sourcePoint,
        sourceOut,
        { x: sourceOut.x, y: laneY },
        { x: targetOut.x, y: laneY },
        targetOut,
        targetPoint,
      ]);
      return {
        points,
        laneY,
        score:
          manhattanLength(points) +
          Math.abs(laneY - midY) * 0.2 +
          obstaclePenalty(points, expandedObstacles) * 100000 +
          (preferHorizontal ? 0 : 60),
      };
    }),
    ...[...xCandidates].map((laneX) => {
      const points = simplifyPoints([
        sourcePoint,
        sourceOut,
        { x: laneX, y: sourceOut.y },
        { x: laneX, y: targetOut.y },
        targetOut,
        targetPoint,
      ]);
      return {
        points,
        laneX,
        score:
          manhattanLength(points) +
          Math.abs(laneX - midX) * 0.2 +
          obstaclePenalty(points, expandedObstacles) * 100000 +
          (preferHorizontal ? 60 : 0),
      };
    }),
  ].sort((a, b) => a.score - b.score);

  return candidates[0] || { points: [sourcePoint, targetPoint] };
}

function resolveEndpoint(
  block: ComponentBlock | undefined,
  rect: RouteRect | undefined,
  peerRect: RouteRect | undefined,
  pinName: string | undefined,
  handlePoints: Record<string, LayoutPoint>,
): { point?: LayoutPoint; side?: PortSide } {
  if (!block || !rect) return {};
  const handleId = resolvePinHandleId(block, pinName);
  const measuredPoint = handleId ? handlePoints[handleId] : undefined;
  if (measuredPoint) {
    return {
      point: measuredPoint,
      side: nearestSide(measuredPoint, rect),
    };
  }

  const side = peerRect ? sideFacing(rect, peerRect) : 'right';
  return {
    point: pointOnSide(rect, side, peerRect),
    side,
  };
}

export function buildArchitectureRoutePlans(
  blocks: ComponentBlock[],
  connections: ConnectionData[],
  measuredNodeRects: Record<string, RouteRect> = {},
  measuredHandlePoints: Record<string, LayoutPoint> = {},
): Record<string, RoutePlan> {
  const rects = blocks.map((block) => measuredNodeRects[block.id] ?? getNodeRect(block));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const rectById = new Map(rects.map((rect) => [rect.id, rect]));
  const groups = new Map<string, ConnectionData[]>();
  const routeKinds = new Map<string, RouteKind>();

  connections.forEach((connection) => {
    const routeKind = classifyRoute(connection);
    routeKinds.set(connection.id, routeKind);
    const key = routePairKey(connection, routeKind);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(connection);
  });

  const plans: Record<string, RoutePlan> = {};
  connections.forEach((connection) => {
    const routeKind = routeKinds.get(connection.id) ?? classifyRoute(connection);
    const sourceRect = rectById.get(connection.from);
    const targetRect = rectById.get(connection.to);
    const sourceBlock = blockById.get(connection.from);
    const targetBlock = blockById.get(connection.to);
    const obstacles = rects.filter((rect) => rect.id !== connection.from && rect.id !== connection.to);
    const group = groups.get(routePairKey(connection, routeKind)) ?? [connection];
    const groupIndex = Math.max(0, group.findIndex((candidate) => candidate.id === connection.id));
    const offset = bundleOffset(groupIndex, group.length);

    const source = resolveEndpoint(
      sourceBlock,
      sourceRect,
      targetRect,
      connection.source_pin || connection.from_pin,
      measuredHandlePoints,
    );
    const target = resolveEndpoint(
      targetBlock,
      targetRect,
      sourceRect,
      connection.target_pin || connection.to_pin,
      measuredHandlePoints,
    );

    if (!sourceRect || !targetRect || !source.point || !target.point || !source.side || !target.side) {
      plans[connection.id] = { routeKind, sourceRect, targetRect, obstacles };
      return;
    }

    const sourceOut = escapePoint(source.point, source.side);
    const targetOut = escapePoint(target.point, target.side);
    const route = chooseRoute(
      source.point,
      sourceOut,
      targetOut,
      target.point,
      sourceRect,
      targetRect,
      obstacles,
      source.side,
      target.side,
      offset,
    );

    plans[connection.id] = {
      routeKind,
      sourceRect,
      targetRect,
      sourcePoint: source.point,
      targetPoint: target.point,
      sourceSide: source.side,
      targetSide: target.side,
      obstacles,
      points: route.points,
      preferredLaneY: route.laneY,
      preferredLaneX: route.laneX,
    };
  });

  return plans;
}
