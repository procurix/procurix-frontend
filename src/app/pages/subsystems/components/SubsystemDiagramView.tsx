import { useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type NodeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Subsystem, Component } from '@/app/types';
import type { Connection as APIConnection, SubsystemConnection } from '@/app/services/api';
import { Focus, Network } from 'lucide-react';
import { ComponentNode } from '../../architecture/components/ComponentNode';
import { CustomEdge } from '../../architecture/components/CustomEdge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubsystemDiagramViewProps {
  selectedSubsystem: Subsystem;
  allSubsystems: Subsystem[];
  allComponents: Component[];
  connections: APIConnection[];
  subsystemConnections?: SubsystemConnection[];
}

type DiagramMode = 'isolated' | 'context';

// ─── Edge Styling (mirrors SystemArchitectureView) ────────────────────────────

const defaultConnectionTypeColors: Record<string, string> = {
  power: '#ef4444',
  switching: '#f59e0b',
  power_and_feedback: '#8b5cf6',
  signal: '#3b82f6',
  data: '#8b5cf6',
  analog: '#f59e0b',
  differential: '#ec4899',
  clock: '#10b981',
  ground: '#6b7280',
  feedback: '#9333ea',
  control: '#06b6d4',
};

const getEdgeColor = (type: string): string => {
  const t = (type || '').toLowerCase();
  return defaultConnectionTypeColors[t] || '#6b7280';
};

const getEdgeStyle = (type: string): React.CSSProperties => {
  const color = getEdgeColor(type);
  const base: React.CSSProperties = { stroke: color, zIndex: 1 };
  const t = (type || '').toLowerCase();
  switch (t) {
    case 'power':            return { ...base, strokeWidth: 3 };
    case 'switching':        return { ...base, strokeWidth: 5 };
    case 'power_and_feedback': return { ...base, strokeWidth: 4, strokeDasharray: '10,5' };
    case 'signal':           return { ...base, strokeWidth: 3 };
    case 'data':             return { ...base, strokeWidth: 3, strokeDasharray: '5,5' };
    case 'analog':           return { ...base, strokeWidth: 3, strokeDasharray: '8,4' };
    case 'differential':     return { ...base, strokeWidth: 3, strokeDasharray: '3,3' };
    case 'clock':            return { ...base, strokeWidth: 3, strokeDasharray: '12,4,4,4' };
    case 'ground':           return { ...base, strokeWidth: 4, strokeDasharray: '15,5' };
    case 'feedback':         return { ...base, strokeWidth: 3, strokeDasharray: '6,6' };
    case 'control':          return { ...base, strokeWidth: 3, strokeDasharray: '4,4' };
    default:                 return { ...base, strokeWidth: 2 };
  }
};

// ─── Node / Edge Types ────────────────────────────────────────────────────────

const edgeTypes = {
  smoothstep: (props: any) => <CustomEdge {...props} />,
  default: (props: any) => <CustomEdge {...props} />,
};

function subsystemSourceHandle(nodeId: string): string {
  return `${nodeId}-subsystem-source`;
}

function subsystemTargetHandle(nodeId: string): string {
  return `${nodeId}-subsystem-target`;
}

const SubsystemComponentNode = (props: NodeProps) => {
  const data = props.data as unknown as Component;
  return (
    <div className="relative overflow-visible">
      <Handle
        id={subsystemTargetHandle(data.id)}
        type="target"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', width: 12, height: 12 }}
      />
      <Handle
        id={subsystemSourceHandle(data.id)}
        type="source"
        position={Position.Right}
        style={{ opacity: 0, top: '50%', width: 12, height: 12 }}
      />
      <ComponentNode {...props} />
    </div>
  );
};

const SubsystemGroupNode = (props: NodeProps) => {
  const label = typeof props.data?.label === 'string' ? props.data.label : '';
  return (
    <div className="relative h-full w-full overflow-visible">
      <Handle
        id={subsystemTargetHandle(props.id)}
        type="target"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', width: 12, height: 12 }}
      />
      <Handle
        id={subsystemSourceHandle(props.id)}
        type="source"
        position={Position.Right}
        style={{ opacity: 0, top: '50%', width: 12, height: 12 }}
      />
      <div className="pointer-events-none">{label}</div>
    </div>
  );
};

const nodeTypes = {
  component: SubsystemComponentNode as any,
  subsystemGroup: SubsystemGroupNode as any,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compById(allComponents: Component[], mpn: string): Component {
  return (
    allComponents.find((c) => c.id === mpn || c.partNumber === mpn) ?? {
      id: mpn,
      reference: mpn,
      partNumber: mpn,
      type: 'COMPONENT',
      description: mpn,
      specs: {},
      isIdentified: false,
      isGeneric: false,
      complianceStatus: 'unknown' as const,
    }
  );
}

function normalizeEndpointKey(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function buildComponentEndpointLookup(allComponents: Component[]): Map<string, string[]> {
  const lookup = new Map<string, string[]>();

  const addAlias = (alias: string | null | undefined, componentId: string) => {
    const key = normalizeEndpointKey(alias);
    if (!key) return;
    const ids = lookup.get(key) || [];
    if (!ids.includes(componentId)) {
      lookup.set(key, [...ids, componentId]);
    }
  };

  allComponents.forEach((component) => {
    addAlias(component.id, component.id);
    addAlias(component.partNumber, component.id);
    addAlias(component.reference, component.id);
  });

  return lookup;
}

function resolveEndpointComponentIds(
  endpoint: string | null | undefined,
  componentLookup: Map<string, string[]>,
): string[] {
  return componentLookup.get(normalizeEndpointKey(endpoint)) || [];
}

function isVisibleArchitectureConnection(connection: APIConnection): boolean {
  const status = String(connection.status || '').trim().toLowerCase();
  return Boolean(
    connection.source_part
      && connection.target_part
      && connection.source_pin?.trim()
      && connection.target_pin?.trim()
      && status !== 'rejected'
      && status !== 'deleted',
  );
}

function connectionType(connection: APIConnection): string {
  return connection.connection_type || 'signal';
}

function makeComponentNode(
  comp: Component,
  position: { x: number; y: number },
  extra?: Partial<Node>,
): Node {
  return {
    id: comp.id,
    type: 'component',
    position,
    data: comp as any,
    ...extra,
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  connectionType: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): Edge {
  const color = getEdgeColor(connectionType);
  return {
    id,
    source,
    target,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
    type: 'smoothstep',
    label: connectionType,
    labelStyle: { fontSize: 9, fill: color, fontWeight: 600 },
    labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
    style: getEdgeStyle(connectionType),
    markerEnd: { type: MarkerType.ArrowClosed, color },
    animated: connectionType === 'switching',
  } as Edge;
}

function makeComponentEdge(
  id: string,
  source: string,
  target: string,
  connectionType: string,
): Edge {
  return makeEdge(id, source, target, connectionType, {
    sourceHandle: subsystemSourceHandle(source),
    targetHandle: subsystemTargetHandle(target),
  });
}

// ─── Build: Isolated Layout ───────────────────────────────────────────────────

const NODE_W = 300;
const COLS_GAP = 360;
const ROWS_GAP = 220;

function buildIsolatedLayout(
  selectedSubsystem: Subsystem,
  allSubsystems: Subsystem[],
  allComponents: Component[],
  connections: APIConnection[],
): { nodes: Node[]; edges: Edge[] } {
  const compIds = selectedSubsystem.componentIds;
  const compSet = new Set(compIds);
  const componentLookup = buildComponentEndpointLookup(allComponents);
  const cols = Math.max(1, Math.ceil(Math.sqrt(compIds.length)));

  // Component nodes for this subsystem
  const compNodes: Node[] = compIds.map((mpn, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return makeComponentNode(compById(allComponents, mpn), {
      x: 60 + col * COLS_GAP,
      y: 60 + row * ROWS_GAP,
    });
  });

  // Internal edges — connections where both ends belong to this subsystem
  const internalEdges: Edge[] = connections
    .filter(isVisibleArchitectureConnection)
    .flatMap((c, i) => {
      const sourceIds = resolveEndpointComponentIds(c.source_part, componentLookup)
        .filter((id) => compSet.has(id));
      const targetIds = resolveEndpointComponentIds(c.target_part, componentLookup)
        .filter((id) => compSet.has(id));

      return sourceIds.flatMap((sourceId) =>
        targetIds.map((targetId) =>
          makeComponentEdge(
            `int_${c.id || i}_${sourceId}_${targetId}`,
            sourceId,
            targetId,
            connectionType(c),
          ),
        ),
      );
    });

  // Build external stubs — one stub node per connected subsystem.
  // subsystemConnections is always computed client-side from part-level connections,
  // so there is no API race and no need for a fallback code path.
  const subById = new Map(allSubsystems.map((s) => [s.id, s]));
  const partToSubsystem = new Map<string, string>();
  allSubsystems.forEach((sub) => {
    sub.componentIds.forEach((partId) => partToSubsystem.set(partId, sub.id));
  });

  const maxCompX = compIds.length > 0
    ? 60 + (Math.min(cols - 1, compIds.length - 1)) * COLS_GAP + NODE_W
    : 60 + NODE_W;

  const stubNodes: Node[] = [];
  const stubEdges: Edge[] = [];
  const stubIds = new Set<string>();
  let outIdx = 0;
  let inIdx = 0;

  const ensureStubNode = (
    direction: 'out' | 'in',
    externalKey: string,
    label: string,
    primaryType: string,
  ): string => {
    const stubId = `stub_${direction}_${externalKey}`;
    if (stubIds.has(stubId)) return stubId;
    stubIds.add(stubId);

    const color = getEdgeColor(primaryType);
    const idx = direction === 'out' ? outIdx++ : inIdx++;
    stubNodes.push({
      id: stubId,
      type: 'default',
      position: { x: direction === 'out' ? maxCompX + 80 : -340, y: idx * 140 },
      data: { label },
      style: {
        background: '#f9fafb',
        border: `2px dashed ${color}`,
        borderRadius: 8,
        fontSize: 11,
        color: '#6b7280',
        width: 200,
        padding: '8px 12px',
      },
    });

    return stubId;
  };

  connections
    .filter(isVisibleArchitectureConnection)
    .forEach((connection, connectionIndex) => {
      const sourceIds = resolveEndpointComponentIds(connection.source_part, componentLookup);
      const targetIds = resolveEndpointComponentIds(connection.target_part, componentLookup);
      const type = connectionType(connection);

      sourceIds.forEach((sourceId) => {
        targetIds.forEach((targetId) => {
          const sourceInSelected = compSet.has(sourceId);
          const targetInSelected = compSet.has(targetId);
          if (sourceInSelected === targetInSelected) return;

          if (sourceInSelected) {
            const targetSubId = partToSubsystem.get(targetId) || `external_${targetId}`;
            const targetSub = subById.get(targetSubId);
            const stubId = ensureStubNode('out', targetSubId, `to ${targetSub?.name || targetId}`, type);
            stubEdges.push(
              makeEdge(`stub_edge_out_${connection.id || connectionIndex}_${sourceId}_${targetId}`, sourceId, stubId, type, {
                sourceHandle: subsystemSourceHandle(sourceId),
              }),
            );
            return;
          }

          const sourceSubId = partToSubsystem.get(sourceId) || `external_${sourceId}`;
          const sourceSub = subById.get(sourceSubId);
          const stubId = ensureStubNode('in', sourceSubId, `from ${sourceSub?.name || sourceId}`, type);
          stubEdges.push(
            makeEdge(`stub_edge_in_${connection.id || connectionIndex}_${sourceId}_${targetId}`, stubId, targetId, type, {
              targetHandle: subsystemTargetHandle(targetId),
            }),
          );
        });
      });
    });

  return {
    nodes: [...compNodes, ...stubNodes],
    edges: [...internalEdges, ...stubEdges],
  };
}

// ─── Build: Context Layout ────────────────────────────────────────────────────
// Uses absolute positioning (no parentId) so cross-subsystem edges always render.
// Group background panels are non-interactive default nodes placed behind components.

const COMPS_PER_ROW = 3;
const GROUP_PADDING = 50;
const SUBSYSTEM_SPACING_X = 1300;

function buildContextLayout(
  selectedSubsystem: Subsystem,
  allSubsystems: Subsystem[],
  allComponents: Component[],
  connections: APIConnection[],
  subsystemConnections: SubsystemConnection[],
): { nodes: Node[]; edges: Edge[] } {
  const groupNodes: Node[] = [];
  const compNodes: Node[] = [];

  const cols = Math.max(1, Math.ceil(Math.sqrt(allSubsystems.length)));

  // First pass — compute group heights so rows stack correctly
  const groupHeights = allSubsystems.map((sub) => {
    const numCompRows = Math.max(1, Math.ceil(sub.componentIds.length / COMPS_PER_ROW));
    return numCompRows * ROWS_GAP + GROUP_PADDING * 2 + 50;
  });

  // Max height per row of subsystems
  const rowHeights: number[] = [];
  allSubsystems.forEach((_, idx) => {
    const row = Math.floor(idx / cols);
    rowHeights[row] = Math.max(rowHeights[row] || 0, groupHeights[idx]);
  });

  const rowOffsets: number[] = [50];
  rowHeights.forEach((h, i) => {
    rowOffsets[i + 1] = rowOffsets[i] + h + 80;
  });

  allSubsystems.forEach((sub, subIdx) => {
    const isSelected = sub.id === selectedSubsystem.id;
    const col = subIdx % cols;
    const row = Math.floor(subIdx / cols);

    const actualCols = Math.min(sub.componentIds.length, COMPS_PER_ROW);
    const groupWidth = Math.max(420, actualCols * COLS_GAP + GROUP_PADDING * 2);
    const groupHeight = groupHeights[subIdx];

    const gx = col * SUBSYSTEM_SPACING_X + 50;
    const gy = rowOffsets[row];
    groupNodes.push({
      id: `group_${sub.id}`,
      type: 'subsystemGroup',
      position: { x: gx, y: gy },
      style: {
        width: groupWidth,
        height: groupHeight,
        background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(156,163,175,0.04)',
        border: isSelected ? '2px solid #8b5cf6' : '2px dashed #d1d5db',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        color: isSelected ? '#7c3aed' : '#9ca3af',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: '10px 14px',
        pointerEvents: 'none',
        opacity: isSelected ? 1 : 0.45,
        zIndex: 0,
      },
      data: { label: sub.name },
      draggable: false,
      selectable: false,
    });

    // Component nodes — ABSOLUTE positions (gx + relative offset inside group)
    sub.componentIds.forEach((mpn, compIdx) => {
      const cCol = compIdx % COMPS_PER_ROW;
      const cRow = Math.floor(compIdx / COMPS_PER_ROW);
      const cx = gx + GROUP_PADDING + cCol * COLS_GAP;
      const cy = gy + GROUP_PADDING + 40 + cRow * ROWS_GAP;
      const comp = compById(allComponents, mpn);

      compNodes.push({
        id: `ctx_${sub.id}_${mpn}`,
        type: 'component',
        position: { x: cx, y: cy },
        data: comp as any,
        style: isSelected ? undefined : { opacity: 0.3 },
      });
    });
  });

  // Part-level edges between ctx_${subId}_${mpn} nodes.
  // Connections involving the selected subsystem are highlighted; others are dimmed.
  const partToSubsystem = new Map<string, string>();
  allSubsystems.forEach((sub) => {
    sub.componentIds.forEach((mpn) => partToSubsystem.set(mpn, sub.id));
  });
  const componentLookup = buildComponentEndpointLookup(allComponents);

  const partEdges: Edge[] = connections
    .filter(isVisibleArchitectureConnection)
    .flatMap((c, i) => {
      const sourceIds = resolveEndpointComponentIds(c.source_part, componentLookup);
      const targetIds = resolveEndpointComponentIds(c.target_part, componentLookup);

      return sourceIds.flatMap((sourceId) =>
        targetIds.flatMap((targetId) => {
          const srcSub = partToSubsystem.get(sourceId);
          const tgtSub = partToSubsystem.get(targetId);
          if (!srcSub || !tgtSub) return [];

          const type = connectionType(c);
          const isInvolved =
            srcSub === selectedSubsystem.id || tgtSub === selectedSubsystem.id;
          const color = getEdgeColor(type);

          return [{
            id: `ctx_edge_${c.id || i}_${sourceId}_${targetId}`,
            source: `ctx_${srcSub}_${sourceId}`,
            target: `ctx_${tgtSub}_${targetId}`,
            sourceHandle: subsystemSourceHandle(sourceId),
            targetHandle: subsystemTargetHandle(targetId),
            type: 'smoothstep',
            label: isInvolved ? type : undefined,
            labelStyle: { fontSize: 9, fill: color, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
            style: {
              ...(isInvolved ? getEdgeStyle(type) : { stroke: '#d1d5db', strokeWidth: 1 }),
              opacity: isInvolved ? 1 : 0.15,
              zIndex: isInvolved ? 10 : 1,
            },
            markerEnd: isInvolved ? { type: MarkerType.ArrowClosed, color } : undefined,
            animated: isInvolved && type === 'switching',
          }] as Edge[];
        }),
      );
    });

  // Subsystem-level abstraction edges: group_${id} → group_${id}.
  // These show the architectural relationship between subsystems regardless of which
  // components are involved. Rendered above part-level edges (higher zIndex).
  const subsystemEdges: Edge[] = subsystemConnections.map((sc, i) => {
    const isInvolved =
      sc.source_subsystem_id === selectedSubsystem.id ||
      sc.target_subsystem_id === selectedSubsystem.id;
    const color = getEdgeColor(sc.primary_type);
    return {
      id: `ctx_sub_edge_${i}`,
      source: `group_${sc.source_subsystem_id}`,
      target: `group_${sc.target_subsystem_id}`,
      sourceHandle: subsystemSourceHandle(`group_${sc.source_subsystem_id}`),
      targetHandle: subsystemTargetHandle(`group_${sc.target_subsystem_id}`),
      type: 'smoothstep',
      label: `${sc.primary_type} (${sc.part_connection_count})`,
      labelStyle: { fontSize: 10, fill: color, fontWeight: 700 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.95 },
      style: {
        ...(isInvolved ? getEdgeStyle(sc.primary_type) : { stroke: '#9ca3af', strokeWidth: 1.5 }),
        opacity: isInvolved ? 1 : 0.35,
        zIndex: 20,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: isInvolved ? color : '#9ca3af' },
      animated: isInvolved && sc.primary_type === 'switching',
    } as Edge;
  });

  return {
    nodes: [...groupNodes, ...compNodes],
    edges: [...partEdges, ...subsystemEdges],
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SubsystemDiagramView({
  selectedSubsystem,
  allSubsystems,
  allComponents,
  connections,
  subsystemConnections = [],
}: SubsystemDiagramViewProps) {
  const [mode, setMode] = useState<DiagramMode>('isolated');

  const { nodes: computed, edges: computedEdges } = useMemo(() => {
    if (mode === 'isolated') {
      return buildIsolatedLayout(selectedSubsystem, allSubsystems, allComponents, connections);
    }
    return buildContextLayout(selectedSubsystem, allSubsystems, allComponents, connections, subsystemConnections);
  }, [mode, selectedSubsystem, allSubsystems, allComponents, connections, subsystemConnections]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computed);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computed);
    setEdges(computedEdges);
  }, [computed, computedEdges, setNodes, setEdges]);

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-purple-600" />
          <span className="font-semibold text-gray-900 text-sm">Subsystem Architecture</span>
          <span className="text-xs text-gray-500">
            ({selectedSubsystem.componentIds.length} components)
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setMode('isolated')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'isolated'
                ? 'bg-white text-purple-700 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Focus className="h-3 w-3" />
            Isolated
          </button>
          <button
            onClick={() => setMode('context')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'context'
                ? 'bg-white text-purple-700 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Network className="h-3 w-3" />
            Full Context
          </button>
        </div>
      </div>

      {/* ReactFlow canvas */}
      <div style={{ height: 480 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.1}
          maxZoom={1.5}
        >
          <Background gap={20} color="#f0f0f0" />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={2} zoomable pannable style={{ height: 80 }} />
        </ReactFlow>
      </div>

      {/* Legend */}
      {mode === 'isolated' && (
        <div className="flex flex-wrap items-center gap-4 px-5 py-2 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500 font-medium">Connections:</span>
          {Object.entries(defaultConnectionTypeColors).slice(0, 6).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-5 h-0.5" style={{ background: color, height: '2px' }} />
              <span className="text-xs text-gray-500 capitalize">{type.replace(/_/g, ' ')}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-5 h-0.5" style={{ borderTop: '2px dashed #9ca3af', height: '1px', width: '20px' }} />
            <span className="text-xs text-gray-500">Cross-subsystem stub</span>
          </div>
        </div>
      )}
    </div>
  );
}
