import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, type Position } from '@xyflow/react';
import { X } from 'lucide-react';

interface RouteRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoutePoint {
  x: number;
  y: number;
}

type PortSide = 'left' | 'right' | 'top' | 'bottom';

interface EdgePathOptions {
  bend?: number;
  route?: 'orthogonal';
  points?: RoutePoint[];
  cornerRadius?: number;
  obstacles?: RouteRect[];
  sourceRect?: RouteRect;
  targetRect?: RouteRect;
  preferredLaneY?: number;
  preferredLaneX?: number;
  sourcePoint?: RoutePoint;
  targetPoint?: RoutePoint;
  clearance?: number;
}

interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
  style?: React.CSSProperties;
  markerEnd?: string;
  label?: React.ReactNode;
  labelStyle?: React.CSSProperties;
  labelBgStyle?: React.CSSProperties;
  type?: string;
  pathOptions?: EdgePathOptions;
  selectedEdgeId?: string | null;
  onDelete?: (edgeId: string) => void;
  selected?: boolean;
  data?: {
    selected?: boolean;
    selectedEdgeId?: string | null;
    onDeleteEdge?: (edgeId: string) => void;
    onDelete?: (edgeId: string) => void;
    onSelectEdge?: (edgeId: string) => void;
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

function segmentIntersectsRect(a: RoutePoint, b: RoutePoint, rect: RouteRect): boolean {
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

function routeIntersects(points: RoutePoint[], obstacles: RouteRect[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i].x === points[i + 1].x && points[i].y === points[i + 1].y) continue;
    if (obstacles.some((rect) => segmentIntersectsRect(points[i], points[i + 1], rect))) {
      return true;
    }
  }
  return false;
}

function routeMiddleIntersects(points: RoutePoint[], obstacles: RouteRect[]): boolean {
  const middle = points.slice(1, -1);
  return middle.length > 1 && routeIntersects(middle, obstacles);
}

function simplifyRoute(points: RoutePoint[]): RoutePoint[] {
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

function distance(a: RoutePoint, b: RoutePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pointToward(from: RoutePoint, to: RoutePoint, amount: number): RoutePoint {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return { x: from.x + dx * amount, y: from.y + dy * amount };
}

function pointsToPath(points: RoutePoint[], cornerRadius = 0): string {
  const simplified = simplifyRoute(points);
  const [first] = simplified;
  if (!first) return '';
  if (simplified.length === 1) return `M ${first.x},${first.y}`;
  if (cornerRadius <= 0 || simplified.length < 3) {
    return `M ${first.x},${first.y} ${simplified.slice(1).map((point) => `L ${point.x},${point.y}`).join(' ')}`;
  }

  const commands = [`M ${first.x},${first.y}`];
  for (let index = 1; index < simplified.length - 1; index += 1) {
    const prev = simplified[index - 1];
    const current = simplified[index];
    const next = simplified[index + 1];
    const radius = Math.min(cornerRadius, distance(prev, current) / 2, distance(current, next) / 2);
    if (radius <= 0) {
      commands.push(`L ${current.x},${current.y}`);
      continue;
    }
    const entry = pointToward(current, prev, radius);
    const exit = pointToward(current, next, radius);
    commands.push(`L ${entry.x},${entry.y}`);
    commands.push(`Q ${current.x},${current.y} ${exit.x},${exit.y}`);
  }

  const last = simplified[simplified.length - 1];
  commands.push(`L ${last.x},${last.y}`);
  return commands.join(' ');
}

function nearestPortSide(point: RoutePoint, rect: RouteRect): PortSide {
  const distances = [
    { side: 'left' as const, value: Math.abs(point.x - rect.x) },
    { side: 'right' as const, value: Math.abs(point.x - (rect.x + rect.width)) },
    { side: 'top' as const, value: Math.abs(point.y - rect.y) },
    { side: 'bottom' as const, value: Math.abs(point.y - (rect.y + rect.height)) },
  ].sort((a, b) => a.value - b.value);
  return distances[0].side;
}

function escapePoint(point: RoutePoint, rect: RouteRect | undefined, clearance: number): RoutePoint {
  if (!rect) return { ...point };
  const side = nearestPortSide(point, rect);
  if (side === 'left') return { x: rect.x - clearance, y: point.y };
  if (side === 'right') return { x: rect.x + rect.width + clearance, y: point.y };
  if (side === 'top') return { x: point.x, y: rect.y - clearance };
  return { x: point.x, y: rect.y + rect.height + clearance };
}

function getOrthogonalObstaclePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  options?: EdgePathOptions,
): string | null {
  const clearance = options?.clearance ?? 34;
  const sourcePoint = options?.sourcePoint ?? { x: sourceX, y: sourceY };
  const targetPoint = options?.targetPoint ?? { x: targetX, y: targetY };
  const sourceOut = escapePoint(sourcePoint, options?.sourceRect, clearance);
  const targetOut = escapePoint(targetPoint, options?.targetRect, clearance);
  const obstacles = [
    ...(options?.sourceRect ? [options.sourceRect] : []),
    ...(options?.targetRect ? [options.targetRect] : []),
    ...(options?.obstacles ?? []),
  ].map((rect) => expandRect(rect, 16));
  const travelMinX = Math.min(sourceOut.x, targetOut.x);
  const travelMaxX = Math.max(sourceOut.x, targetOut.x);
  const travelMinY = Math.min(sourceOut.y, targetOut.y);
  const travelMaxY = Math.max(sourceOut.y, targetOut.y);
  const relevantObstacles = obstacles.filter((rect) => {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    return right >= travelMinX && left <= travelMaxX && bottom >= travelMinY - clearance * 4 && top <= travelMaxY + clearance * 4;
  });

  const yLanes = new Set<number>([
    ...(typeof options?.preferredLaneY === 'number' ? [options.preferredLaneY] : []),
    sourceOut.y,
    targetOut.y,
    (sourceOut.y + targetOut.y) / 2,
  ]);

  relevantObstacles.forEach((rect) => {
    yLanes.add(rect.y - clearance);
    yLanes.add(rect.y + rect.height + clearance);
  });

  for (let step = 1; step <= 8; step += 1) {
    yLanes.add(sourceOut.y + step * clearance);
    yLanes.add(sourceOut.y - step * clearance);
    yLanes.add(targetOut.y + step * clearance);
    yLanes.add(targetOut.y - step * clearance);
  }

  const horizontalRoutes = [...yLanes].map((laneY) => {
    const points = [
      sourcePoint,
      sourceOut,
      { x: sourceOut.x, y: laneY },
      { x: targetOut.x, y: laneY },
      targetOut,
      targetPoint,
    ];
    const distance =
      Math.abs(sourceOut.x - sourceX) +
      Math.abs(sourceOut.y - laneY) +
      Math.abs(targetOut.x - sourceOut.x) +
      Math.abs(targetOut.y - laneY) +
      Math.abs(targetX - targetOut.x);
    const laneDrift = Math.abs(laneY - sourceOut.y) + Math.abs(laneY - targetOut.y);
    const preferredPenalty = typeof options?.preferredLaneY === 'number'
      ? Math.abs(laneY - options.preferredLaneY) * 0.15
      : 0;
    return { points, score: distance + laneDrift * 0.35 + preferredPenalty };
  });

  const xLanes = new Set<number>([
    ...(typeof options?.preferredLaneX === 'number' ? [options.preferredLaneX] : []),
    sourceOut.x,
    targetOut.x,
    (sourceOut.x + targetOut.x) / 2,
  ]);

  relevantObstacles.forEach((rect) => {
    xLanes.add(rect.x - clearance);
    xLanes.add(rect.x + rect.width + clearance);
  });

  const verticalRoutes = [...xLanes].map((laneX) => {
    const points = [
      sourcePoint,
      sourceOut,
      { x: laneX, y: sourceOut.y },
      { x: laneX, y: targetOut.y },
      targetOut,
      targetPoint,
    ];
    const distance =
      Math.abs(sourceOut.y - sourceY) +
      Math.abs(sourceOut.x - laneX) +
      Math.abs(targetOut.y - sourceOut.y) +
      Math.abs(targetOut.x - laneX) +
      Math.abs(targetY - targetOut.y);
    const laneDrift = Math.abs(laneX - sourceOut.x) + Math.abs(laneX - targetOut.x);
    const preferredPenalty = typeof options?.preferredLaneX === 'number'
      ? Math.abs(laneX - options.preferredLaneX) * 0.15
      : 0;
    return { points, score: distance + laneDrift * 0.35 + preferredPenalty + 20 };
  });

  const routes = [...horizontalRoutes, ...verticalRoutes].sort((a, b) => a.score - b.score);

  const route = routes.find((candidate) => !routeMiddleIntersects(candidate.points, relevantObstacles));
  return route ? pointsToPath(route.points, options?.cornerRadius ?? 8) : null;
}

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  type,
  selectedEdgeId,
  onDelete,
  pathOptions,
  selected,
  data,
}: CustomEdgeProps) {
  const isSelected = Boolean(selected || data?.selected || selectedEdgeId === id || data?.selectedEdgeId === id);
  const deleteHandler = onDelete || data?.onDeleteEdge || data?.onDelete;
  const selectHandler = data?.onSelectEdge;

  const handleSelect = (event: React.MouseEvent<SVGPathElement> | React.PointerEvent<SVGPathElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        selectHandler?.(id);
        window.dispatchEvent(new CustomEvent('architecture:select-edge', { detail: { edgeId: id } }));
      }, 0);
    } else {
      selectHandler?.(id);
    }
  };
  
  // Get the path based on edge type
  let edgePath: string;
  
  const routedPath = pathOptions?.points?.length
    ? pointsToPath(pathOptions.points, pathOptions.cornerRadius ?? 8)
    : null;

  const orthogonalPath = !routedPath && pathOptions?.route === 'orthogonal'
    ? getOrthogonalObstaclePath(sourceX, sourceY, targetX, targetY, pathOptions)
    : null;

  if (routedPath) {
    edgePath = routedPath;
  } else if (orthogonalPath) {
    edgePath = orthogonalPath;
  } else if (type === 'smoothstep') {
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: pathOptions?.bend || 20,
    });
    edgePath = path;
  } else if (type === 'straight') {
    const [path] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });
    edgePath = path;
  } else if (type === 'step') {
    // Step edges use smoothstep path as fallback
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
    edgePath = path;
  } else {
    // default (bezier)
    const [path] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
    edgePath = path;
  }

  // Calculate button position (middle of the edge, positioned above it)
  const buttonX = (sourceX + targetX) / 2;
  const buttonY = (sourceY + targetY) / 2 - 12; // Position 12px above the connection line

  // Calculate label position (middle of the edge)
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
      />

      <path
        d={edgePath}
        fill="none"
        stroke="rgba(15,23,42,0.01)"
        strokeWidth={18}
        strokeLinecap="round"
        pointerEvents="all"
        data-testid={`architecture-edge-${id}`}
        onPointerDown={handleSelect}
        onPointerUp={handleSelect}
        onMouseDown={handleSelect}
        onClick={handleSelect}
        style={{ cursor: 'pointer' }}
      />
      
      {/* Label */}
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          {labelBgStyle && (
            <rect
              x={-50}
              y={-10}
              width={100}
              height={20}
              style={labelBgStyle}
              rx={4}
            />
          )}
          <text
            x={0}
            y={5}
            textAnchor="middle"
            style={labelStyle}
            className="react-flow__edge-text"
          >
            {label}
          </text>
        </g>
      )}
      
      {/* Remove Button - only show when selected */}
      {isSelected && deleteHandler && (
        <g transform={`translate(${buttonX}, ${buttonY})`}>
          <foreignObject
            x={-8}
            y={-8}
            width={16}
            height={16}
            className="react-flow__edge-button"
          >
            <div className="flex items-center justify-center w-full h-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteHandler(id);
                }}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition-colors cursor-pointer border border-white"
                title="Remove connection"
                style={{
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          </foreignObject>
        </g>
      )}
    </>
  );
}
