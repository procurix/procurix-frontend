import type { LayoutPoint } from './layoutAlgorithms';
import type { RouteRect } from './architectureRouting';

export interface ArchitectureMeasurements {
  nodeRects: Record<string, RouteRect>;
  handlePoints: Record<string, LayoutPoint>;
}

type ScreenToFlowPosition = (point: LayoutPoint) => LayoutPoint;

function rectToFlowRect(id: string, rect: DOMRect, screenToFlowPosition: ScreenToFlowPosition): RouteRect {
  const topLeft = screenToFlowPosition({ x: rect.left, y: rect.top });
  const bottomRight = screenToFlowPosition({ x: rect.right, y: rect.bottom });
  return {
    id,
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y),
  };
}

function rectCenterToFlowPoint(rect: DOMRect, screenToFlowPosition: ScreenToFlowPosition): LayoutPoint {
  return screenToFlowPosition({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || 1) > 0
  );
}

export function measureArchitectureCanvas(
  screenToFlowPosition: ScreenToFlowPosition,
): ArchitectureMeasurements {
  const nodeRects: Record<string, RouteRect> = {};
  const handlePoints: Record<string, LayoutPoint> = {};

  document.querySelectorAll<HTMLElement>('[data-architecture-node-id]').forEach((nodeEl) => {
    const nodeId = nodeEl.dataset.architectureNodeId;
    if (!nodeId) return;

    const rect = nodeEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    nodeRects[nodeId] = rectToFlowRect(nodeId, rect, screenToFlowPosition);

    nodeEl.querySelectorAll<HTMLElement>('[data-handleid]').forEach((handleEl) => {
      const handleId = handleEl.dataset.handleid;
      if (!handleId) return;
      if (!isVisibleElement(handleEl)) return;
      const handleRect = handleEl.getBoundingClientRect();
      if (handleRect.width <= 0 || handleRect.height <= 0) return;
      handlePoints[handleId] = rectCenterToFlowPoint(handleRect, screenToFlowPosition);
    });
  });

  return { nodeRects, handlePoints };
}
