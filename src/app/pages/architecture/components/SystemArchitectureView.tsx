import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
  addEdge,
  ConnectionMode,
  Position,
  type Connection,
  type EdgeTypes,
  type Edge,
  type Node,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Component } from '@/app/types';
import { motion } from 'motion/react';
import { CheckCircle, ChevronDown, Hand, Maximize2, MousePointer2, Plus, Trash2, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon } from 'lucide-react';
import { ComponentNode } from './ComponentNode';
import { NetNode } from './NetNode';
import { ArchitectureBuilderSidebar } from './ArchitectureBuilderSidebar';
import { CustomEdge } from './CustomEdge';
import { ArchitectureAssistantPanel } from './ArchitectureAssistantPanel';
import { Button } from '@/app/shared/components/ui/button';
import { Input } from '@/app/shared/components/ui/input';
import { PartModelDrawer } from '@/app/shared/components/PartModelDrawer';
import {
  addNetMember,
  applyArchitectureProposal,
  applyArchitectureProposalWithResult,
  confirmNet,
  createConnection,
  createNet,
  deleteConnection as deleteConnectionApi,
  deleteNet,
  dismissArchitectureProposal,
  mergeNets,
  rejectNet,
  removeNetMember,
  splitNet,
  updateConnection,
  updateNet,
  updateNetLayout,
  type ArchitectureCompletionReadiness,
  type ArchitectureCompletionReadinessItem,
  type ArchitectureNet,
  type ArchitectureNetMutationResponse,
} from '@/app/services/api';
import { toast } from 'sonner';
import { createQuantityMap, getComponentQuantity, createPinoutMap, getComponentPinout, type BackendResponse } from '../utils/parseBackendResponse';
import { Settings2, Shuffle } from 'lucide-react';
import { applyElkLayout, applyLayout, type LayoutType } from '../utils/layoutAlgorithms';
import {
  buildArchitectureNetModel,
  isVirtualNetId,
  persistedNetNodeId,
  VIRTUAL_NET_SOURCE_HANDLE,
  VIRTUAL_NET_TARGET_HANDLE,
} from '../utils/architectureNetModel';
import {
  applyPersistedPositions,
  buildArchitectureLayoutMetadata,
  loadArchitectureLayoutMetadata,
  saveArchitectureLayoutMetadata,
  type ArchitectureLayoutMetadata,
} from '../utils/architectureLayoutMetadata';
import { measureArchitectureCanvas, type ArchitectureMeasurements } from '../utils/architectureMeasurements';
import {
  buildActivePinsByBlock,
  getPinOptions,
  getPinSelectValue,
  getPinValueFromHandle,
  isHandleOwnedByNode,
  resolvePinHandleId,
} from '../utils/architecturePorts';
import { buildArchitectureRoutePlans, type PortSide } from '../utils/architectureRouting';
import {
  buildSaveConnectionPayload,
  mapApiConnections,
  type ArchitectureConnectionData as ConnectionData,
  type ArchitectureUnresolvedConnectionCandidate,
} from '../utils/connectionMapping';
import {
  getProposalAction,
  getProposalConfig,
  getProposalConnectionIds,
  getProposalSourceNetIds,
  getProposalTargetNetId,
  proposalPayload,
  proposalString,
  validateProposalPayload,
  type ArchitectureAssistantProposal,
  type ProposalAction,
} from '../utils/architectureProposalRegistry';

export interface ComponentBlock extends Component {
  x: number;
  y: number;
  connections: string[];
  category?: string;
  quantity?: number;
  pinout?: Record<string, { name: string; type: string; description: string }>;
}

interface SystemArchitectureViewProps {
  components: Component[];
  onArchitectureComplete: (blocks: ComponentBlock[], connections: ConnectionData[]) => void;
  backendResponse?: BackendResponse; // Optional backend response with component_bom
  initialConnections?: ConnectionData[]; // Optional initial connections from API
  initialUnresolvedConnections?: ArchitectureUnresolvedConnectionCandidate[];
  initialNets?: ArchitectureNet[];
  completionReadiness?: ArchitectureCompletionReadiness | null;
  designId?: string;
  layoutScopeId?: string;
  onRefreshNets?: () => Promise<ArchitectureNet[]>;
  onRefreshCompletionReadiness?: () => Promise<ArchitectureCompletionReadiness | null>;
  classificationMap?: Record<string, string>; // part_number -> 'auxiliary'|'non-auxiliary'
}

interface NetLinkDraft {
  from: string;
  to: string;
  sourcePin: string;
  targetPin: string;
}

interface NetEditDraft {
  label: string;
  type: string;
}

interface NewNetDraft {
  name: string;
  type: string;
}

interface NetAssignDraft {
  connectionId: string;
}

interface NetSplitDraft {
  name: string;
  connectionIds: string[];
}

interface NetMergeDraft {
  targetNetId: string;
}

const nodeTypes = {
  component: ComponentNode,
  net: NetNode,
} satisfies NodeTypes;

const architectureEdgeTypes = {
  default: CustomEdge,
  straight: CustomEdge,
  step: CustomEdge,
  smoothstep: CustomEdge,
} satisfies EdgeTypes;

const MIN_CANVAS_ZOOM = 0.2;
const MAX_CANVAS_ZOOM = 1.6;
const EMPTY_NET_LINK_DRAFT: NetLinkDraft = { from: '', to: '', sourcePin: '', targetPin: '' };
const EMPTY_NET_EDIT_DRAFT: NetEditDraft = { label: '', type: 'signal' };
const EMPTY_NEW_NET_DRAFT: NewNetDraft = { name: '', type: 'signal' };
const EMPTY_NET_ASSIGN_DRAFT: NetAssignDraft = { connectionId: '' };
const EMPTY_NET_SPLIT_DRAFT: NetSplitDraft = { name: '', connectionIds: [] };
const EMPTY_NET_MERGE_DRAFT: NetMergeDraft = { targetNetId: '' };
const EMPTY_ARCHITECTURE_NETS: ArchitectureNet[] = [];

function localSuggestedNetBlocker(net: ArchitectureNet): ArchitectureCompletionReadinessItem {
  const memberCount = net.member_connection_ids?.length ?? net.members?.length ?? 0;
  return {
    type: 'suggested_net',
    id: net.id,
    label: `Review suggested net ${net.name || net.id}`,
    severity: 'blocking',
    payload: {
      name: net.name,
      net_type: net.net_type,
      member_count: memberCount,
    },
  };
}

function completionBlockerSummary(blockers: ArchitectureCompletionReadinessItem[]): string {
  if (blockers.length === 0) return '';
  const counts = blockers.reduce<Record<string, number>>((acc, blocker) => {
    acc[blocker.type] = (acc[blocker.type] || 0) + 1;
    return acc;
  }, {});
  const parts = [
    counts.suggested_net ? `${counts.suggested_net} suggested net${counts.suggested_net === 1 ? '' : 's'}` : '',
    counts.unresolved_connection ? `${counts.unresolved_connection} unresolved connection${counts.unresolved_connection === 1 ? '' : 's'}` : '',
    counts.pinless_connection ? `${counts.pinless_connection} pinless connection${counts.pinless_connection === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  if (parts.length > 0) return `Review ${parts.join(', ')} before completing architecture.`;
  if (blockers.length === 1) return blockers[0].label;
  return `Review ${blockers.length} architecture blocker${blockers.length === 1 ? '' : 's'} before completing architecture.`;
}

function getPersistedNetId(block: ComponentBlock | null | undefined): string | null {
  const value = String(block?.specs?.netId || '').trim();
  return value || null;
}

function isPersistedConnectionId(id: string): boolean {
  return Boolean(id && !id.startsWith('conn-') && !id.includes(':'));
}

// Default connection type colors
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

// Available colors for custom connection types (distinct colors that don't repeat)
const customConnectionTypeColorPalette = [
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#a855f7', // Violet
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#22d3ee', // Sky
  '#34d399', // Emerald
  '#fb7185', // Pink
  '#60a5fa', // Light Blue
  '#a78bfa', // Light Purple
  '#fbbf24', // Amber
];

const getEdgeColor = (type: string) => {
  const typeLower = (type || '').toLowerCase();
  
  // Check default colors first
  if (defaultConnectionTypeColors[typeLower]) {
    return defaultConnectionTypeColors[typeLower];
  }
  
  // Check custom colors from localStorage
  try {
    const saved = localStorage.getItem('customConnectionTypeColors');
    if (saved) {
      const customColors = JSON.parse(saved);
      if (customColors[typeLower]) {
        return customColors[typeLower];
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  
  // Default gray for unknown types
  return '#6b7280';
};

// Get connection type color - uses stored colors for custom types
const getConnectionTypeColor = (connectionType: string, customConnectionTypeColors?: Record<string, string>): string => {
  const type = (connectionType || '').toLowerCase();
  
  // Check default colors first
  if (defaultConnectionTypeColors[type]) {
    return defaultConnectionTypeColors[type];
  }
  
  // Check custom colors if provided
  if (customConnectionTypeColors && customConnectionTypeColors[type]) {
    return customConnectionTypeColors[type];
  }
  
  // Default gray for unknown types
  return '#6b7280';
};

function toArchitectureConnectionType(type: string): ConnectionData['type'] {
  const normalized = type.toLowerCase();
  return Object.prototype.hasOwnProperty.call(defaultConnectionTypeColors, normalized)
    ? normalized as ConnectionData['type']
    : 'signal';
}

function toReactFlowPosition(side: PortSide | undefined): Position | undefined {
  if (side === 'left') return Position.Left;
  if (side === 'right') return Position.Right;
  if (side === 'top') return Position.Top;
  if (side === 'bottom') return Position.Bottom;
  return undefined;
}

// Get edge style based on connection type (color, line style, width)
const getEdgeStyle = (type: string) => {
  const baseStyle: React.CSSProperties = {
    stroke: getEdgeColor(type),
    opacity: 0.82,
    zIndex: 1,
  };

  // Apply different line styles based on connection type
  switch (type) {
    case 'power':
      return {
        ...baseStyle,
        strokeWidth: 3,
      };
    case 'switching':
      return {
        ...baseStyle,
        strokeWidth: 5,
        strokeDasharray: undefined,
      };
    case 'power_and_feedback':
      return {
        ...baseStyle,
        strokeWidth: 4,
        strokeDasharray: '10,5',
      };
    case 'signal':
      return {
        ...baseStyle,
        strokeWidth: 3,
      };
    case 'data':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '5,5',
      };
    case 'analog':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '8,4', // dashed line
      };
    case 'differential':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '3,3', // dotted line
      };
    case 'clock':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '12,4,4,4', // dash-dot pattern
      };
    case 'ground':
      return {
        ...baseStyle,
        strokeWidth: 4,
        strokeDasharray: '15,5', // long dashes
      };
    case 'feedback':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '6,6', // medium dashes
      };
    case 'control':
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '4,4', // short dashes
      };
    default:
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: undefined, // solid line
      };
  }
};

function splitComponentAndNetBlocks(
  laidOutBlocks: ComponentBlock[],
  componentIds: Set<string>,
): { componentBlocks: ComponentBlock[]; virtualBlocks: ComponentBlock[] } {
  return {
    componentBlocks: laidOutBlocks.filter((block) => componentIds.has(block.id)),
    virtualBlocks: laidOutBlocks.filter((block) => !componentIds.has(block.id) && isVirtualNetId(block.id)),
  };
}

// Inner component that uses useReactFlow hook
function SystemArchitectureViewInner({ components, onArchitectureComplete, backendResponse, initialConnections, initialUnresolvedConnections, initialNets, completionReadiness, classificationMap, designId, layoutScopeId, onRefreshNets, onRefreshCompletionReadiness }: SystemArchitectureViewProps) {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [blocks, setBlocks] = useState<ComponentBlock[]>([]);
  const [virtualNetBlocks, setVirtualNetBlocks] = useState<ComponentBlock[]>([]);
  const [connections, setConnections] = useState<ConnectionData[]>(() => initialConnections || []);
  const [unresolvedConnectionCandidates, setUnresolvedConnectionCandidates] = useState<ArchitectureUnresolvedConnectionCandidate[]>(() => initialUnresolvedConnections || []);
  const [unresolvedPinDrafts, setUnresolvedPinDrafts] = useState<Record<string, { sourcePin: string; targetPin: string }>>({});
  const [pendingUnresolvedAction, setPendingUnresolvedAction] = useState<{ id: string; action: 'create' | 'dismiss' } | null>(null);
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);
  const [netLinkDraft, setNetLinkDraft] = useState<NetLinkDraft>(EMPTY_NET_LINK_DRAFT);
  const [netEditDraft, setNetEditDraft] = useState<NetEditDraft>(EMPTY_NET_EDIT_DRAFT);
  const [newNetDraft, setNewNetDraft] = useState<NewNetDraft>(EMPTY_NEW_NET_DRAFT);
  const [netAssignDraft, setNetAssignDraft] = useState<NetAssignDraft>(EMPTY_NET_ASSIGN_DRAFT);
  const [netSplitDraft, setNetSplitDraft] = useState<NetSplitDraft>(EMPTY_NET_SPLIT_DRAFT);
  const [netMergeDraft, setNetMergeDraft] = useState<NetMergeDraft>(EMPTY_NET_MERGE_DRAFT);
  const [netReviewWarning, setNetReviewWarning] = useState<string | null>(null);
  const [hiddenNetKeys, setHiddenNetKeys] = useState<Set<string>>(() => new Set());
  const [netOverrides, setNetOverrides] = useState<Record<string, Partial<ArchitectureNet>>>({});
  const [netAdditions, setNetAdditions] = useState<ArchitectureNet[]>([]);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [openConnectionTypeDropdown, setOpenConnectionTypeDropdown] = useState(false);
  const [showAddConnectionType, setShowAddConnectionType] = useState(false);
  const [newConnectionType, setNewConnectionType] = useState('');
  const [layoutType, setLayoutType] = useState<LayoutType>('random');
  const [viewMode, setViewMode] = useState<'all' | 'fundamental'>('fundamental');
  const [canvasMode, setCanvasMode] = useState<'pan' | 'move'>('pan');
  const [selectedModelMpn, setSelectedModelMpn] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<ArchitectureMeasurements>({ nodeRects: {}, handlePoints: {} });
  const connectionsRef = useRef<ConnectionData[]>(connections);
  const layoutRunRef = useRef(0);
  const lastFitNodeSignatureRef = useRef('');
  const layoutMetadataRef = useRef<ArchitectureLayoutMetadata | null>(null);
  const edgeDeleteHandlerRef = useRef<(edgeId: string) => void>(() => {});
  const isNodeDragActiveRef = useRef(false);
  const pendingDeletedLocalConnectionIdsRef = useRef<Set<string>>(new Set());
  const effectiveLayoutScopeId = layoutScopeId || designId || null;
  const initialNetIds = useMemo(
    () => new Set((initialNets || EMPTY_ARCHITECTURE_NETS).map((net) => net.id)),
    [initialNets],
  );
  const sourceNets = useMemo(
    () => [
      ...(initialNets || EMPTY_ARCHITECTURE_NETS),
      ...netAdditions.filter((net) => !initialNetIds.has(net.id)),
    ],
    [initialNets, initialNetIds, netAdditions],
  );
  const persistedNets = useMemo(
    () => sourceNets.map((net) => {
      const override = netOverrides[net.id];
      if (!override) return net;
      return {
        ...net,
        ...override,
        layout: override.layout !== undefined
          ? { ...(net.layout || {}), ...(override.layout || {}) }
          : net.layout,
        member_connection_ids: override.member_connection_ids ?? net.member_connection_ids,
        members: override.members ?? net.members,
      };
    }),
    [sourceNets, netOverrides],
  );

  useEffect(() => {
    setUnresolvedConnectionCandidates(initialUnresolvedConnections || []);
  }, [initialUnresolvedConnections]);

  useEffect(() => {
    if (!initialNets) return;
    const refreshedIds = new Set(initialNets.map((net) => net.id));
    setNetOverrides((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([netId]) => !refreshedIds.has(netId)),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    setNetAdditions((prev) => prev.filter((net) => !refreshedIds.has(net.id)));
  }, [initialNets]);

  const applyNetPatch = useCallback((netId: string, patch: Partial<ArchitectureNet>) => {
    setNetOverrides((prev) => {
      const previous = prev[netId] || {};
      const next: Partial<ArchitectureNet> = { ...previous, ...patch };
      if (patch.layout !== undefined) {
        next.layout = { ...(previous.layout || {}), ...(patch.layout || {}) };
      }
      return { ...prev, [netId]: next };
    });
  }, []);

  const applyNetResponse = useCallback((response: ArchitectureNetMutationResponse) => {
    if (!response?.id) return;
    if (typeof response.name === 'string' && typeof response.net_type === 'string') {
      setNetAdditions((prev) => (
        prev.some((net) => net.id === response.id)
          ? prev.map((net) => net.id === response.id ? { ...net, ...response } as ArchitectureNet : net)
          : [...prev, response as ArchitectureNet]
      ));
    }
    applyNetPatch(response.id, response);
  }, [applyNetPatch]);

  const refreshAuthoritativeNets = useCallback(async () => {
    if (!onRefreshNets) return;
    try {
      await onRefreshNets();
    } catch (error) {
      console.warn('Failed to refresh architecture nets', error);
    }
  }, [onRefreshNets]);

  const applyNetResponseAndRefresh = useCallback(async (response: ArchitectureNetMutationResponse) => {
    applyNetResponse(response);
    await refreshAuthoritativeNets();
  }, [applyNetResponse, refreshAuthoritativeNets]);

  const handleOpenPartModel = useCallback((mpn: string) => {
    if (!mpn) return;
    setSelectedModelMpn(mpn);
  }, []);

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 160 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 160 });
  }, [zoomOut]);

  const handleFitCanvas = useCallback(() => {
    void fitView({ padding: 0.32, duration: 260 });
  }, [fitView]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setZoomLevel(viewport.zoom);
  }, []);

  const handleNodeDragStart = useCallback(() => {
    isNodeDragActiveRef.current = true;
  }, []);

  const canMoveNodes = isBuilderMode || canvasMode === 'move';

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    layoutMetadataRef.current = loadArchitectureLayoutMetadata(effectiveLayoutScopeId);
  }, [effectiveLayoutScopeId]);

  const persistLayoutSnapshot = useCallback((componentBlocks: ComponentBlock[], netBlocks: ComponentBlock[]) => {
    if (!effectiveLayoutScopeId) return;
    const metadata = buildArchitectureLayoutMetadata(
      effectiveLayoutScopeId,
      componentBlocks,
      netBlocks,
      layoutMetadataRef.current,
    );
    layoutMetadataRef.current = metadata;
    saveArchitectureLayoutMetadata(effectiveLayoutScopeId, metadata);
  }, [effectiveLayoutScopeId]);

  // Fundamental-only filter: set of non-auxiliary part IDs (handles both spellings)
  const fundamentalIds = useMemo(() => {
    if (!classificationMap || Object.keys(classificationMap).length === 0) return null;
    return new Set(
      Object.entries(classificationMap)
        .filter(([, cls]) => cls === 'non-auxiliary' || cls === 'non_auxiliary')
        .map(([id]) => id)
    );
  }, [classificationMap]);

  // Load custom connection types from localStorage
  const [customConnectionTypes, setCustomConnectionTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('customConnectionTypes');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Load custom connection type colors from localStorage
  const [customConnectionTypeColors, setCustomConnectionTypeColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('customConnectionTypeColors');
    return saved ? JSON.parse(saved) : {};
  });

  const activePinsByBlock = useMemo(() => {
    return buildActivePinsByBlock(connections);
  }, [connections]);

  const netModel = useMemo(
    () => buildArchitectureNetModel(blocks, connections, hiddenNetKeys, persistedNets),
    [blocks, connections, hiddenNetKeys, persistedNets]
  );

  const positionedVirtualNetBlocks = useMemo(() => {
    const persistedPositions = new Map(
      virtualNetBlocks.map((block) => [block.id, { x: block.x, y: block.y }])
    );
    return netModel.virtualNetBlocks.map((block) => {
      const position = persistedPositions.get(block.id);
      return position ? { ...block, x: position.x, y: position.y } : block;
    });
  }, [netModel.virtualNetBlocks, virtualNetBlocks]);

  const renderBlocks = useMemo(
    () => [...blocks, ...positionedVirtualNetBlocks],
    [blocks, positionedVirtualNetBlocks]
  );

  const selectedNetBlock = useMemo(
    () => renderBlocks.find((block) => block.id === selectedNetId && isVirtualNetId(block.id)),
    [renderBlocks, selectedNetId]
  );

  const selectedNetMembers = useMemo(() => {
    if (!selectedNetBlock) return [];
    const memberIds = new Set(selectedNetBlock.connections);
    return connections.filter((connection) => memberIds.has(connection.id));
  }, [connections, selectedNetBlock]);

  const selectedPersistedNetId = getPersistedNetId(selectedNetBlock);

  const activePersistedNets = useMemo(() => (
    persistedNets.filter((net) => !['hidden', 'rejected', 'ungrouped'].includes(String(net.status || '').toLowerCase()))
  ), [persistedNets]);

  const reviewRequiredNets = useMemo(() => (
    activePersistedNets.filter((net) => {
      const status = String(net.status || 'suggested').toLowerCase();
      const memberCount = net.member_connection_ids?.length ?? net.members?.length ?? 0;
      return status === 'suggested' && memberCount > 0;
    })
  ), [activePersistedNets]);

  const completionBlockers = useMemo(
    () => completionReadiness?.blockers ?? reviewRequiredNets.map(localSuggestedNetBlocker),
    [completionReadiness, reviewRequiredNets],
  );
  const canCompleteArchitecture = completionReadiness?.can_complete ?? completionBlockers.length === 0;
  const completionWarning = useMemo(
    () => completionBlockerSummary(completionBlockers),
    [completionBlockers],
  );
  const blockerConnectionIds = useMemo(
    () => new Set(
      completionBlockers
        .filter((blocker) => blocker.type === 'pinless_connection' && blocker.id)
        .map((blocker) => String(blocker.id))
    ),
    [completionBlockers],
  );

  const assignableConnections = useMemo(() => {
    if (!selectedPersistedNetId) return [];
    const selectedMemberIds = new Set(selectedNetBlock?.connections || []);
    return connections.filter((connection) => (
      !connection.isVirtualNetSegment &&
      !selectedMemberIds.has(connection.id) &&
      !connection.net_id &&
      !String(connection.id).includes(':')
    ));
  }, [connections, selectedNetBlock, selectedPersistedNetId]);

  const mergeTargetNets = useMemo(() => (
    activePersistedNets.filter((net) => net.id !== selectedPersistedNetId)
  ), [activePersistedNets, selectedPersistedNetId]);

  const renderConnections = netModel.renderConnections;
  const routePlans = useMemo(
    () => buildArchitectureRoutePlans(
      renderBlocks,
      renderConnections,
      measurements.nodeRects,
      measurements.handlePoints,
    ),
    [renderBlocks, renderConnections, measurements.nodeRects, measurements.handlePoints]
  );

  // Convert blocks and connections to React Flow format
  const initialNodes = useMemo(() => {
    return renderBlocks.map((block) => {
      if (isVirtualNetId(block.id)) {
        return {
          id: block.id,
          type: 'net',
          position: { x: block.x, y: block.y },
          data: {
            label: block.partNumber || block.reference || block.id.replace(/^net:/, ''),
            netId: String(block.specs?.netId || ''),
            netKey: String(block.specs?.netKey || ''),
            netType: String(block.specs?.netType || 'signal'),
            netStatus: String(block.specs?.netStatus || ''),
            netKind: String(block.specs?.netKind || 'bus'),
            isPersistedNet: Boolean(block.specs?.isPersistedNet),
            connectionCount: Number(block.specs?.connectionCount || 0),
          },
          draggable: canMoveNodes,
        } as Node;
      }

      return {
        id: block.id,
        type: 'component',
        position: { x: block.x, y: block.y },
        data: {
          ...block,
          category: block.category,
          pinout: block.pinout,
          activePinNames: [...(activePinsByBlock.get(block.id) || [])],
          onOpenModel: designId ? handleOpenPartModel : undefined,
        },
      } as Node;
    });
  }, [activePinsByBlock, canMoveNodes, designId, handleOpenPartModel, renderBlocks]);

  // Keep React Flow edge creation thin. Routing decisions live in
  // architectureRouting so the component does not own EDA path logic.
  const initialEdges = useMemo(() => {
    const connectionCounts = new Map<string, number>();

    return renderConnections.flatMap((conn) => {
      const sourceBlock = renderBlocks.find((block) => block.id === conn.from);
      const targetBlock = renderBlocks.find((block) => block.id === conn.to);
      if (!sourceBlock || !targetBlock) return [];

      const sourceIsVirtualNet = isVirtualNetId(conn.from);
      const targetIsVirtualNet = isVirtualNetId(conn.to);
      const sourceHandle = sourceIsVirtualNet
        ? VIRTUAL_NET_SOURCE_HANDLE
        : resolvePinHandleId(sourceBlock, conn.source_pin || conn.from_pin);
      const targetHandle = targetIsVirtualNet
        ? VIRTUAL_NET_TARGET_HANDLE
        : resolvePinHandleId(targetBlock, conn.target_pin || conn.to_pin);

      if (!sourceHandle || !targetHandle) return [];

      const connectionKey = `${conn.from}-${conn.to}-${sourceHandle || 'default'}-${targetHandle || 'default'}`;
      const connectionIndex = connectionCounts.get(connectionKey) || 0;
      connectionCounts.set(connectionKey, connectionIndex + 1);
      const routePlan = routePlans[conn.id];
      const edgeId = connectionIndex > 0
        ? `${conn.id}-${sourceHandle}-${targetHandle}-${connectionIndex}`
        : `${conn.id}-${sourceHandle}-${targetHandle}`;
      
      // Create detailed label with connection_type, signal_name, and voltage/pins
      const labelParts = [];
      
      // Add connection type
      if (conn.connection_type) {
        labelParts.push(`[${conn.connection_type}]`);
      } else if (conn.type) {
        labelParts.push(`[${conn.type}]`);
      }
      
      // Add signal name
      if (conn.signal_name) {
        labelParts.push(conn.signal_name);
      } else if (conn.label) {
        labelParts.push(conn.label);
      }
      
      // Add pins/voltage info
      if (conn.pins) {
        labelParts.push(`(${conn.pins})`);
      }
      
      const edgeType = (conn.edgeType || 'default') as 'default' | 'straight' | 'step' | 'smoothstep';
      const sourcePosition = toReactFlowPosition(routePlan?.sourceSide);
      const targetPosition = toReactFlowPosition(routePlan?.targetSide);

      const labelText = labelParts.join(' ') || conn.type;
      const isHovered = hoveredEdgeId === edgeId;
      const isSelected = selectedEdgeId === edgeId;
      const needsPinReview = blockerConnectionIds.has(conn.originalConnectionId || conn.id);
      
      return [{
        id: edgeId,
        source: conn.from,
        target: conn.to,
        sourceHandle,
        targetHandle,
        type: edgeType, // Use edgeType from connection data
        sourcePosition: sourcePosition,
        targetPosition: targetPosition,
        animated: conn.type === 'switching', // Only animate switching, not power
        style: {
          ...getEdgeStyle(conn.type),
          ...(needsPinReview ? { strokeDasharray: '6 4', strokeWidth: 2.5 } : {}),
        },
        zIndex: isHovered || isSelected || needsPinReview ? 2 : 0,
        label: (isHovered || isSelected || needsPinReview) ? labelText : undefined, // Show label on hover, selected, or review-needed edges
        labelStyle: {
          fill: getEdgeColor(conn.type),
          fontWeight: 600,
          fontSize: 10,
        },
        labelBgStyle: {
          fill: 'white',
          fillOpacity: 0.95,
          padding: '2px 6px',
          borderRadius: '4px',
        },
        data: {
          connectionId: conn.originalConnectionId || conn.id,
          componentFrom: conn.componentFrom || conn.from,
          componentTo: conn.componentTo || conn.to,
          selected: isSelected,
          needsPinReview,
          onSelectEdge: (id: string) => {
            setSelectedEdgeId(id);
            setSelectedNetId(null);
            setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
            setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
            setOpenConnectionTypeDropdown(false);
          },
          onDeleteEdge: (id: string) => edgeDeleteHandlerRef.current(id),
        },
        pathOptions: {
          points: routePlan?.points,
          route: routePlan?.points ? undefined : 'orthogonal',
          cornerRadius: 10,
          clearance: 40,
          sourceRect: routePlan?.sourceRect,
          targetRect: routePlan?.targetRect,
          sourcePoint: routePlan?.sourcePoint,
          targetPoint: routePlan?.targetPoint,
          preferredLaneY: routePlan?.preferredLaneY,
          preferredLaneX: routePlan?.preferredLaneX,
          obstacles: routePlan?.obstacles,
          ...(edgeType === 'smoothstep' && {
            bend: 24,
          }),
        },
      } as Edge];
    });
  }, [blockerConnectionIds, renderConnections, renderBlocks, hoveredEdgeId, selectedEdgeId, routePlans]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Filtered views for fundamental/all toggle (must be after nodes/edges are declared)
  const displayEdges = useMemo(() => {
    if (viewMode === 'all' || !fundamentalIds) return edges;
    return edges.filter((edge) => {
      const data = edge.data as { componentFrom?: string; componentTo?: string } | undefined;
      const componentFrom = data?.componentFrom || edge.source;
      const componentTo = data?.componentTo || edge.target;
      return fundamentalIds.has(componentFrom) && fundamentalIds.has(componentTo);
    });
  }, [edges, viewMode, fundamentalIds]);

  const displayNodes = useMemo(() => {
    if (viewMode === 'all' || !fundamentalIds) return nodes;
    const visibleNodeIds = new Set<string>();
    displayEdges.forEach((edge) => {
      visibleNodeIds.add(edge.source);
      visibleNodeIds.add(edge.target);
    });
    return nodes.filter((node) => fundamentalIds.has(node.id) || visibleNodeIds.has(node.id));
  }, [displayEdges, nodes, viewMode, fundamentalIds]);

  const displayNodeSignature = useMemo(
    () => displayNodes.map((node) => node.id).sort().join('|'),
    [displayNodes],
  );

  const refreshMeasurements = useCallback(() => {
    setMeasurements(measureArchitectureCanvas(screenToFlowPosition));
  }, [screenToFlowPosition]);

  const handleNodeDragStop = useCallback((_event: unknown, node: Node) => {
    isNodeDragActiveRef.current = false;
    const position = { x: node.position.x, y: node.position.y };

    if (isVirtualNetId(node.id)) {
      const baseVirtualBlock = renderBlocks.find((block) => block.id === node.id);
      const persistedNetId = getPersistedNetId(baseVirtualBlock);
      if (persistedNetId) {
        applyNetPatch(persistedNetId, { layout: position });
        if (designId) {
          void updateNetLayout(designId, persistedNetId, position)
            .then(applyNetResponseAndRefresh)
            .catch((error) => console.error('Failed to persist net layout', error));
        }
      }

      setVirtualNetBlocks((prev) => {
        const existing = prev.some((block) => block.id === node.id);
        const next = existing
          ? prev.map((block) => block.id === node.id ? { ...block, ...position } : block)
          : baseVirtualBlock
            ? [...prev, { ...baseVirtualBlock, ...position }]
            : prev;
        persistLayoutSnapshot(blocks, next);
        return next;
      });
    } else {
      setBlocks((prev) => {
        const next = prev.map((block) => block.id === node.id ? { ...block, ...position } : block);
        persistLayoutSnapshot(next, virtualNetBlocks);
        return next;
      });
    }

    window.requestAnimationFrame(refreshMeasurements);
  }, [applyNetPatch, applyNetResponseAndRefresh, blocks, designId, persistLayoutSnapshot, refreshMeasurements, renderBlocks, virtualNetBlocks]);

  useEffect(() => {
    if (!nodesInitialized || !displayNodeSignature) return;
    if (lastFitNodeSignatureRef.current === displayNodeSignature) return;
    lastFitNodeSignatureRef.current = displayNodeSignature;

    const timeout = window.setTimeout(() => {
      fitView({ padding: 0.3, duration: 300 });
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [displayNodeSignature, fitView, nodesInitialized]);

  useEffect(() => {
    if (!nodesInitialized) return;
    let frame = window.requestAnimationFrame(refreshMeasurements);
    const timeout = window.setTimeout(() => {
      frame = window.requestAnimationFrame(refreshMeasurements);
    }, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [displayNodes, nodesInitialized, refreshMeasurements, zoomLevel]);

  // Fit view when view mode changes
  useEffect(() => {
    setTimeout(() => { fitView({ padding: 0.2, duration: 300 }); }, 50);
  }, [viewMode, fitView]);

  // Update nodes and edges when blocks/connections change
  useEffect(() => {
    if (isNodeDragActiveRef.current) return;
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const persistNewConnection = useCallback(async (localConnection: ConnectionData) => {
    if (!designId) return;
    const payload = buildSaveConnectionPayload([localConnection])[0];
    if (!payload) return;

    try {
      const created = await createConnection(designId, payload);
      if (pendingDeletedLocalConnectionIdsRef.current.has(localConnection.id)) {
        pendingDeletedLocalConnectionIdsRef.current.delete(localConnection.id);
        if (created.id) {
          void deleteConnectionApi(designId, created.id).catch((error) => {
            console.error('Failed to clean up deleted pending connection', error);
          });
        }
        return;
      }
      const mapped = mapApiConnections([created])[0];
      if (!mapped) return;
      if (!connectionsRef.current.some((connection) => connection.id === localConnection.id)) {
        if (created.id) {
          void deleteConnectionApi(designId, created.id).catch((error) => {
            console.error('Failed to clean up orphaned pending connection', error);
          });
        }
        return;
      }
      setConnections((prev) => prev.map((connection) => (
        connection.id === localConnection.id
          ? { ...mapped, edgeType: localConnection.edgeType || mapped.edgeType }
          : connection
      )));
    } catch (error) {
      console.error('Failed to persist connection', error);
      setConnections((prev) => prev.filter((connection) => connection.id !== localConnection.id));
    }
  }, [designId]);

  const findBlockByPart = useCallback((part: string | undefined) => {
    if (!part) return undefined;
    return blocks.find((block) => (
      block.id === part ||
      block.partNumber === part ||
      block.reference === part
    ));
  }, [blocks]);

  const handleUnresolvedPinDraftChange = useCallback((candidateId: string, key: 'sourcePin' | 'targetPin', value: string) => {
    setUnresolvedPinDrafts((prev) => ({
      ...prev,
      [candidateId]: {
        sourcePin: prev[candidateId]?.sourcePin || '',
        targetPin: prev[candidateId]?.targetPin || '',
        [key]: value,
      },
    }));
  }, []);

  const handleResolveUnresolvedConnection = useCallback(async (candidate: ArchitectureUnresolvedConnectionCandidate) => {
    if (!designId) return;
    if (!candidate.proposal_id) {
      toast.error('Connection candidate is missing its proposal ID. Refresh architecture and retry.');
      return;
    }
    const sourceBlock = findBlockByPart(candidate.source_part);
    const targetBlock = findBlockByPart(candidate.target_part);
    const draft = unresolvedPinDrafts[candidate.id] || { sourcePin: '', targetPin: '' };
    const sourcePin = draft.sourcePin || getPinSelectValue(sourceBlock, candidate.source_pin);
    const targetPin = draft.targetPin || getPinSelectValue(targetBlock, candidate.target_pin);
    if (!sourcePin || !targetPin) {
      toast.error('Select both endpoint pins before creating the connection.');
      return;
    }

    setPendingUnresolvedAction({ id: candidate.id, action: 'create' });
    try {
      const resultPayload = {
        source_part: sourceBlock?.id || candidate.source_part,
        target_part: targetBlock?.id || candidate.target_part,
        source_pin: sourcePin,
        target_pin: targetPin,
        connection_type: candidate.connection_type || 'signal',
        signal_name: candidate.signal_name || undefined,
        reasoning: candidate.reasoning || undefined,
        confidence: candidate.confidence,
        pin_resolution_source: 'manual',
      };

      const created = (await applyArchitectureProposalWithResult(designId, candidate.proposal_id, resultPayload)).connection;
      const mapped = created ? mapApiConnections([created])[0] : undefined;
      if (mapped) {
        setConnections((prev) => (
          prev.some((connection) => connection.id === mapped.id) ? prev : [...prev, mapped]
        ));
      }
      setUnresolvedConnectionCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      setUnresolvedPinDrafts((prev) => {
        const next = { ...prev };
        delete next[candidate.id];
        return next;
      });
      if (created?.net_id) {
        await refreshAuthoritativeNets();
      }
      await onRefreshCompletionReadiness?.();
      toast.success('Connection created from resolved pins.');
    } catch (error) {
      console.error('Failed to resolve unresolved connection candidate', error);
      toast.error(error instanceof Error ? error.message : 'Failed to resolve connection candidate');
    } finally {
      setPendingUnresolvedAction(null);
    }
  }, [designId, findBlockByPart, onRefreshCompletionReadiness, refreshAuthoritativeNets, unresolvedPinDrafts]);

  const handleDismissUnresolvedConnection = useCallback(async (candidate: ArchitectureUnresolvedConnectionCandidate) => {
    if (!designId || !candidate.proposal_id) return;

    setPendingUnresolvedAction({ id: candidate.id, action: 'dismiss' });
    try {
      await dismissArchitectureProposal(designId, candidate.proposal_id, {
        dismissed_from: 'architecture_unresolved_queue',
      });
      setUnresolvedConnectionCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      setUnresolvedPinDrafts((prev) => {
        const next = { ...prev };
        delete next[candidate.id];
        return next;
      });
      void onRefreshCompletionReadiness?.();
      toast.success('Connection candidate dismissed.');
    } catch (error) {
      console.error('Failed to dismiss unresolved connection candidate', error);
      toast.error(error instanceof Error ? error.message : 'Failed to dismiss connection candidate');
    } finally {
      setPendingUnresolvedAction(null);
    }
  }, [designId, onRefreshCompletionReadiness]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (isVirtualNetId(params.source) || isVirtualNetId(params.target)) return;
      if (!params.sourceHandle || !params.targetHandle) return;
      const sourceHandle = isHandleOwnedByNode(params.source, params.sourceHandle)
        ? params.sourceHandle
        : undefined;
      const targetHandle = isHandleOwnedByNode(params.target, params.targetHandle)
        ? params.targetHandle
        : undefined;
      if (!sourceHandle || !targetHandle) return;
      const sourceBlock = blocks.find((block) => block.id === params.source);
      const targetBlock = blocks.find((block) => block.id === params.target);
      const sourcePin = getPinValueFromHandle(sourceBlock, sourceHandle);
      const targetPin = getPinValueFromHandle(targetBlock, targetHandle);
      if (!sourcePin || !targetPin) return;
      const exists = connectionsRef.current.some((connection) => (
        connection.from === params.source &&
        connection.to === params.target &&
        (connection.source_pin || connection.from_pin || '') === (sourcePin || '') &&
        (connection.target_pin || connection.to_pin || '') === (targetPin || '')
      ));
      if (exists) return;
      
      // Create unique edge ID using sourceHandle and targetHandle to prevent overlapping
      const edgeId = sourceHandle || targetHandle
        ? `edge-${params.source}-${params.target}-${sourceHandle || 'src'}-${targetHandle || 'tgt'}-${Date.now()}`
        : `edge-${params.source}-${params.target}-${Date.now()}`;
      
      const newEdge: Edge = {
        ...params,
        sourceHandle,
        targetHandle,
        id: edgeId,
        type: 'default',
        animated: true,
        style: getEdgeStyle('signal'), // Default to signal type styling for new connections
      };
      setEdges((eds) => {
        return addEdge(newEdge, eds);
      });

      // Also update connections state
      const newConnection: ConnectionData = {
        id: `conn-${params.source}-${params.target}-${Date.now()}`,
        from: params.source,
        to: params.target,
        type: 'signal',
        from_pin: sourcePin,
        to_pin: targetPin,
        source_pin: sourcePin,
        target_pin: targetPin,
        pin_resolution_source: 'manual',
        user_corrected: true,
        edgeType: 'default', // Default to bezier for new connections
      };
      setConnections((prev) => [...prev, newConnection]);
      void persistNewConnection(newConnection);
    },
    [blocks, persistNewConnection, setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target || source === target) return false;
      if (isVirtualNetId(source) || isVirtualNetId(target)) return false;
      if (!connection.sourceHandle || !isHandleOwnedByNode(source, connection.sourceHandle)) return false;
      if (!connection.targetHandle || !isHandleOwnedByNode(target, connection.targetHandle)) return false;
      return true;
    },
    []
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNetId(null);
      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
      setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
      setOpenConnectionTypeDropdown(false);
    },
    []
  );

  useEffect(() => {
    const handleSelectEdge = (event: Event) => {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setSelectedEdgeId(edgeId);
      setSelectedNetId(null);
      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
      setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
      setOpenConnectionTypeDropdown(false);
    };

    window.addEventListener('architecture:select-edge', handleSelectEdge);
    return () => window.removeEventListener('architecture:select-edge', handleSelectEdge);
  }, []);

  const onEdgeMouseEnter = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setHoveredEdgeId(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback(
    () => {
      setHoveredEdgeId(null);
    },
    []
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (isVirtualNetId(node.id)) {
        const data = node.data as { label?: string; netType?: string } | undefined;
        setSelectedNetId(node.id);
        setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
        setNetEditDraft({
          label: String(data?.label || node.id.replace(/^net:/, '')),
          type: String(data?.netType || 'signal'),
        });
        setSelectedEdgeId(null);
        setOpenConnectionTypeDropdown(false);
        return;
      }
      setSelectedNetId(null);
      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
      setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
    },
    []
  );

  const getConnectionIdForEdge = useCallback((edgeId: string | null | undefined): string | null => {
    if (!edgeId) return null;
    const edge = edges.find((candidate) => candidate.id === edgeId);
    const connectionId = edge?.data && typeof edge.data.connectionId === 'string'
      ? edge.data.connectionId
      : null;
    if (connectionId) return connectionId;

    const direct = connections.find((connection) => connection.id === edgeId);
    if (direct) return direct.id;
    if (!edge) return null;

    const matching = connections.find((connection) => {
      const sourceHandle = resolvePinHandleId(
        blocks.find((block) => block.id === connection.from),
        connection.source_pin || connection.from_pin,
      );
      const targetHandle = resolvePinHandleId(
        blocks.find((block) => block.id === connection.to),
        connection.target_pin || connection.to_pin,
      );

      return connection.from === edge.source
        && connection.to === edge.target
        && (sourceHandle || undefined) === edge.sourceHandle
        && (targetHandle || undefined) === edge.targetHandle;
    });

    return matching?.id || null;
  }, [blocks, connections, edges]);

  const handleEdgeTypeChange = useCallback(
    (edgeId: string, newEdgeType: 'default' | 'straight' | 'step' | 'smoothstep') => {
      const connectionId = getConnectionIdForEdge(edgeId);
      const connection = connections.find(conn => conn.id === connectionId);

      if (connection) {
        // Update the connection's edgeType
        setConnections((prev) =>
          prev.map((conn) =>
            conn.id === connection.id
              ? { ...conn, edgeType: newEdgeType }
              : conn
          )
        );
      }
    },
    [connections, getConnectionIdForEdge]
  );

  const handleConnectionTypeChange = useCallback(
    (edgeId: string, newConnectionType: ConnectionData['type']) => {
      const connectionId = getConnectionIdForEdge(edgeId);
      const connection = connections.find(conn => conn.id === connectionId);

      if (connection) {
        // Update the connection's type
        setConnections((prev) =>
          prev.map((conn) =>
            conn.id === connection.id
              ? { ...conn, type: newConnectionType, connection_type: newConnectionType }
              : conn
          )
        );
        if (designId && isPersistedConnectionId(connection.id)) {
          void updateConnection(designId, connection.id, { connection_type: newConnectionType })
            .catch((error) => console.error('Failed to persist connection type', error));
        }
      }
    },
    [connections, designId, getConnectionIdForEdge]
  );

  const handleAddConnectionType = useCallback(() => {
    // Compute connectionTypes inside the callback to avoid initialization order issues
    const defaultConnectionTypes: ConnectionData['type'][] = [
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
    ];
    const allConnectionTypes = [...defaultConnectionTypes, ...customConnectionTypes] as ConnectionData['type'][];
    
    if (newConnectionType.trim() && !allConnectionTypes.includes(newConnectionType.trim().toLowerCase() as ConnectionData['type'])) {
      const newType = newConnectionType.trim().toLowerCase();
      const updated = [...customConnectionTypes, newType];
      setCustomConnectionTypes(updated);
      localStorage.setItem('customConnectionTypes', JSON.stringify(updated));
      
      // Assign a unique color to the new connection type
      const usedColors = new Set([
        ...Object.values(defaultConnectionTypeColors),
        ...Object.values(customConnectionTypeColors)
      ]);
      
      // Find first available color from palette
      let assignedColor = customConnectionTypeColorPalette.find(color => !usedColors.has(color));
      
      // If all colors are used, cycle through palette
      if (!assignedColor) {
        const colorIndex = customConnectionTypes.length % customConnectionTypeColorPalette.length;
        assignedColor = customConnectionTypeColorPalette[colorIndex];
      }
      
      const updatedColors = { ...customConnectionTypeColors, [newType]: assignedColor };
      setCustomConnectionTypeColors(updatedColors);
      localStorage.setItem('customConnectionTypeColors', JSON.stringify(updatedColors));
      
      setNewConnectionType('');
      setShowAddConnectionType(false);
    }
  }, [newConnectionType, customConnectionTypes, customConnectionTypeColors, setCustomConnectionTypes, setCustomConnectionTypeColors]);

  const handleRemoveConnectionType = useCallback((typeToRemove: string) => {
    const updated = customConnectionTypes.filter(t => t !== typeToRemove);
    setCustomConnectionTypes(updated);
    localStorage.setItem('customConnectionTypes', JSON.stringify(updated));
    
    // Remove color assignment
    const updatedColors = { ...customConnectionTypeColors };
    delete updatedColors[typeToRemove];
    setCustomConnectionTypeColors(updatedColors);
    localStorage.setItem('customConnectionTypeColors', JSON.stringify(updatedColors));
  }, [customConnectionTypes, customConnectionTypeColors, setCustomConnectionTypes, setCustomConnectionTypeColors]);

  // Connection types list (default + custom)
  const defaultConnectionTypes: ConnectionData['type'][] = [
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
  ];
  const connectionTypes: ConnectionData['type'][] = [...defaultConnectionTypes, ...customConnectionTypes] as ConnectionData['type'][];

  const generateInitialLayout = useCallback(async (connectionsToUse?: ConnectionData[]) => {
    const layoutRunId = ++layoutRunRef.current;
    // Use all components from the subsystem
    const selectedComponents = components;

    const allBlocks: ComponentBlock[] = [];
    const autoConnections: ConnectionData[] = connectionsToUse || initialConnections || [];

    // Create blocks with metadata first (without positions)
    selectedComponents.forEach((comp: Component) => {
      const category = 'Component';
      
      // Get quantity and pinout from backend response or count instances
      const partNumber = comp.partNumber || comp.id;
      let quantity: number | undefined;
      let pinout: Record<string, { name: string; type: string; description: string }> | undefined;
      
      if (backendResponse) {
        const quantityMap = createQuantityMap(backendResponse);
        const pinoutMap = createPinoutMap(backendResponse);
        const backendQuantity = getComponentQuantity(partNumber, quantityMap);
        pinout = getComponentPinout(partNumber, pinoutMap) || comp.pinout; // Fallback to component's pinout if not in backend
        if (backendQuantity && backendQuantity > 1) {
          quantity = backendQuantity;
        }
      } else {
        // Fallback: use component's existing pinout and count instances of same part
        pinout = comp.pinout;
        const samePartComponents = selectedComponents.filter(c => 
          (c.partNumber || c.id) === partNumber
        );
        if (samePartComponents.length > 1) {
          quantity = samePartComponents.length;
        }
      }
      
      allBlocks.push({
        ...comp,
        x: 0, // Will be set by layout algorithm
        y: 0, // Will be set by layout algorithm
        connections: [],
        category,
        quantity,
        pinout,
      });
    });

    const initialNetModel = buildArchitectureNetModel(allBlocks, autoConnections, new Set(), persistedNets);
    const layoutBlocks = [...allBlocks, ...initialNetModel.virtualNetBlocks];
    const componentIds = new Set(allBlocks.map((block) => block.id));
    const savedLayout = layoutMetadataRef.current;

    // Apply a synchronous fallback first so the canvas never waits on ELK.
    const fallbackLayoutBlocks = applyLayout(layoutType, layoutBlocks, initialNetModel.renderConnections);
    const fallbackBlocks = splitComponentAndNetBlocks(fallbackLayoutBlocks, componentIds);
    if (layoutRunId !== layoutRunRef.current) return;
    setBlocks(applyPersistedPositions(fallbackBlocks.componentBlocks, savedLayout?.nodes));
    setVirtualNetBlocks(applyPersistedPositions(fallbackBlocks.virtualBlocks, savedLayout?.virtualNets));

    try {
      const elkLayoutBlocks = await applyElkLayout(layoutBlocks, initialNetModel.renderConnections);
      const elkBlocks = splitComponentAndNetBlocks(elkLayoutBlocks, componentIds);
      if (layoutRunId !== layoutRunRef.current) return;
      setBlocks(applyPersistedPositions(elkBlocks.componentBlocks, savedLayout?.nodes));
      setVirtualNetBlocks(applyPersistedPositions(elkBlocks.virtualBlocks, savedLayout?.virtualNets));
      setTimeout(() => {
        if (layoutRunId !== layoutRunRef.current) return;
        fitView({ padding: 0.32, duration: 300 });
      }, 100);
    } catch (error) {
      console.warn('ELK layout failed; using fallback layout', error);
    }
  }, [backendResponse, components, fitView, initialConnections, layoutType, persistedNets]);

  // Initial AI analysis and auto-layout
  useEffect(() => {
    const stages = [
      'Analyzing component types...',
      'Detecting power domains...',
      'Mapping signal flows...',
      'Computing optimal layout...',
      'Generating block diagram...'
    ];

    let currentStage = 0;
    let currentProgress = 0;
    let layoutTimeout: ReturnType<typeof setTimeout> | undefined;

    const stageInterval = setInterval(() => {
      currentStage = Math.min(currentStage + 1, stages.length - 1);
      setAnalysisStage(currentStage);

      if (currentStage >= stages.length - 1) {
        clearInterval(stageInterval);
      }
    }, 400);

    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 2, 100);
      setProgress(currentProgress);

      if (currentProgress >= 100) {
        clearInterval(progressInterval);
        layoutTimeout = setTimeout(() => {
          void generateInitialLayout().finally(() => {
            setIsAnalyzing(false);
          });
        }, 300);
      }
    }, 32);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
      if (layoutTimeout) clearTimeout(layoutTimeout);
    };
  }, [generateInitialLayout]);

  const handleComplete = useCallback(async () => {
    let latestReadiness = completionReadiness;
    if (onRefreshCompletionReadiness) {
      try {
        latestReadiness = await onRefreshCompletionReadiness();
      } catch (error) {
        console.warn('Could not refresh architecture completion readiness before completion.', error);
      }
    }
    const latestBlockers = latestReadiness?.blockers ?? completionBlockers;
    const latestCanComplete = latestReadiness?.can_complete ?? latestBlockers.length === 0;
    if (!latestCanComplete) {
      setNetReviewWarning(completionBlockerSummary(latestBlockers));
      return;
    }

    // Convert React Flow nodes back to blocks format
    const updatedBlocks = nodes.map((node) => ({
      ...blocks.find(b => b.id === node.id)!,
      x: node.position.x,
      y: node.position.y,
    }));

    onArchitectureComplete(updatedBlocks, connections);
  }, [blocks, completionBlockers, completionReadiness, connections, nodes, onArchitectureComplete, onRefreshCompletionReadiness]);

  const focusBlocker = useCallback((blocker: ArchitectureCompletionReadinessItem) => {
    if (!blocker.id) return;

    if (blocker.type === 'suggested_net') {
      const netNodeId = persistedNetNodeId(String(blocker.id));
      setSelectedNetId(netNodeId);
      setSelectedEdgeId(null);
      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
      const net = persistedNets.find((candidate) => candidate.id === blocker.id);
      setNetEditDraft({
        label: net?.name || String(blocker.payload?.name || blocker.label || blocker.id),
        type: net?.net_type || String(blocker.payload?.net_type || 'signal'),
      });
      setOpenConnectionTypeDropdown(false);
      window.requestAnimationFrame(() => {
        fitView({ nodes: [{ id: netNodeId }], padding: 0.45, duration: 260 });
      });
      return;
    }

    if (blocker.type === 'pinless_connection') {
      const connectionId = String(blocker.id);
      const edge = edges.find((candidate) => {
        const dataConnectionId = candidate.data && typeof candidate.data.connectionId === 'string'
          ? candidate.data.connectionId
          : null;
        return candidate.id === connectionId || dataConnectionId === connectionId;
      });
      setSelectedEdgeId(edge?.id || connectionId);
      setSelectedNetId(null);
      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
      setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
      setOpenConnectionTypeDropdown(false);
      const targetNodeIds = edge ? [edge.source, edge.target] : [];
      if (targetNodeIds.length > 0) {
        window.requestAnimationFrame(() => {
          fitView({ nodes: targetNodeIds.map((id) => ({ id })), padding: 0.55, duration: 260 });
        });
      }
    }
  }, [edges, fitView, persistedNets]);

  // Builder mode handlers
  const handleAddComponent = useCallback((component: Omit<ComponentBlock, 'x' | 'y' | 'connections'>) => {
    // Find a good position for the new component (center of viewport or next to existing)
    const newX = blocks.length > 0 
      ? Math.max(...blocks.map(b => b.x)) + 400 
      : 400;
    const newY = blocks.length > 0 
      ? blocks[0].y 
      : 300;
    
    const newBlock: ComponentBlock = {
      ...component,
      x: newX,
      y: newY,
      connections: [],
      position: { x: newX, y: newY },
      // Explicitly preserve pinout and specs - ensure they're always objects
      pinout: component.pinout || {},
      specs: component.specs || {},
    };
    
    
    setBlocks((prev) => [...prev, newBlock]);
  }, [blocks]);

  const handleUpdateComponent = useCallback((id: string, updates: Partial<ComponentBlock>) => {
    
    setBlocks((prev) => {
      const updated = prev.map((block) => {
        if (block.id === id) {
          // Always use the pinout from updates if provided, even if empty
          // This ensures that when user clears all pins, it's saved as empty
          // Create a new object reference to ensure React detects the change
          const updatedPinout = updates.pinout !== undefined 
            ? (updates.pinout ? { ...updates.pinout } : {})
            : (block.pinout ? { ...block.pinout } : {});
          
          const updatedBlock: ComponentBlock = { 
            ...block, 
            ...updates,
            // Explicitly set pinout and specs to ensure they're preserved
            pinout: updatedPinout,
            specs: updates.specs !== undefined ? (updates.specs ? { ...updates.specs } : {}) : (block.specs ? { ...block.specs } : {}),
            // Preserve position and connections
            x: block.x,
            y: block.y,
            connections: block.connections,
            position: block.position || { x: block.x, y: block.y },
          };
          
          return updatedBlock;
        }
        return block;
      });
      
      return updated;
    });
  }, []);

  const handleDeleteComponent = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
    setConnections((prev) => prev.filter((conn) => conn.from !== id && conn.to !== id));
  }, []);

  const handleAddConnection = useCallback((connection: Omit<ConnectionData, 'id'>) => {
    const newConnection: ConnectionData = {
      ...connection,
      id: `conn-${connection.from}-${connection.to}-${Date.now()}`,
    };
    setConnections((prev) => [...prev, newConnection]);
    void persistNewConnection(newConnection);
  }, [persistNewConnection]);

  const handleCreateNet = useCallback(() => {
    if (!designId) return;
    const name = newNetDraft.name.trim();
    if (!name) return;
    const netType = String(newNetDraft.type || 'signal').trim().toLowerCase() || 'signal';
    const layout = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    void createNet(designId, {
      name,
      net_type: netType,
      status: 'confirmed',
      layout,
    })
      .then((net) => {
        applyNetResponse(net);
        void refreshAuthoritativeNets();
        setNewNetDraft(EMPTY_NEW_NET_DRAFT);
        setSelectedEdgeId(null);
        setSelectedNetId(persistedNetNodeId(net.id));
      })
      .catch((error) => console.error('Failed to create net', error));
  }, [applyNetResponse, designId, newNetDraft, refreshAuthoritativeNets, screenToFlowPosition]);

  const handleAssignExistingLink = useCallback(() => {
    if (!designId || !selectedPersistedNetId || !netAssignDraft.connectionId || !selectedNetBlock) return;
    const netLabel = selectedNetBlock.reference || selectedNetBlock.partNumber || selectedNetBlock.id.replace(/^net:/, '');
    const netType = String(selectedNetBlock.specs?.netType || 'signal');
    const nextType = toArchitectureConnectionType(netType);
    const connectionId = netAssignDraft.connectionId;
    const currentNet = persistedNets.find((net) => net.id === selectedPersistedNetId);
    const nextMemberIds = Array.from(new Set([...(selectedNetBlock.connections || []), connectionId]));

    setConnections((prev) => prev.map((connection) => (
      connection.id === connectionId
        ? {
          ...connection,
          net_id: selectedPersistedNetId,
          type: nextType,
          connection_type: netType,
          signal_name: String(netLabel),
          label: String(netLabel),
          user_corrected: true,
        }
        : connection
    )));
    applyNetPatch(selectedPersistedNetId, {
      member_connection_ids: nextMemberIds,
      members: currentNet?.members || [],
      user_corrected: true,
    });
    setNetAssignDraft(EMPTY_NET_ASSIGN_DRAFT);

    void addNetMember(designId, selectedPersistedNetId, connectionId)
      .then(applyNetResponseAndRefresh)
      .catch((error) => console.error('Failed to assign connection to net', error));
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, netAssignDraft.connectionId, persistedNets, selectedNetBlock, selectedPersistedNetId]);

  const handleToggleSplitConnection = useCallback((connectionId: string) => {
    setNetSplitDraft((draft) => ({
      ...draft,
      connectionIds: draft.connectionIds.includes(connectionId)
        ? draft.connectionIds.filter((id) => id !== connectionId)
        : [...draft.connectionIds, connectionId],
    }));
  }, []);

  const handleSplitSelectedNet = useCallback(() => {
    if (!designId || !selectedPersistedNetId || !selectedNetBlock) return;
    const name = netSplitDraft.name.trim();
    const connectionIds = netSplitDraft.connectionIds.filter((id) => selectedNetBlock.connections.includes(id));
    if (!name || connectionIds.length === 0 || connectionIds.length >= selectedNetBlock.connections.length) return;

    void splitNet(designId, selectedPersistedNetId, { name, connection_ids: connectionIds })
      .then((net) => {
        const nextType = toArchitectureConnectionType(net.net_type || 'signal');
        setConnections((prev) => prev.map((connection) => (
          connectionIds.includes(connection.id)
            ? {
              ...connection,
              net_id: net.id,
              type: nextType,
              connection_type: net.net_type || 'signal',
              signal_name: net.name,
              label: net.name,
              user_corrected: true,
            }
            : connection
        )));
        applyNetPatch(selectedPersistedNetId, {
          member_connection_ids: selectedNetBlock.connections.filter((id) => !connectionIds.includes(id)),
          user_corrected: true,
        });
        applyNetResponse(net);
        void refreshAuthoritativeNets();
        setNetSplitDraft(EMPTY_NET_SPLIT_DRAFT);
        setSelectedNetId(persistedNetNodeId(net.id));
      })
      .catch((error) => console.error('Failed to split net', error));
  }, [applyNetPatch, applyNetResponse, designId, netSplitDraft, refreshAuthoritativeNets, selectedNetBlock, selectedPersistedNetId]);

  const handleMergeSelectedNet = useCallback(() => {
    if (!designId || !selectedPersistedNetId || !selectedNetBlock || !netMergeDraft.targetNetId) return;
    const targetNet = persistedNets.find((net) => net.id === netMergeDraft.targetNetId);
    if (!targetNet) return;
    const nextType = toArchitectureConnectionType(targetNet.net_type || 'signal');
    const sourceMemberIds = selectedNetBlock.connections || [];
    const targetMemberIds = Array.from(new Set([...(targetNet.member_connection_ids || []), ...sourceMemberIds]));

    setConnections((prev) => prev.map((connection) => (
      sourceMemberIds.includes(connection.id)
        ? {
          ...connection,
          net_id: targetNet.id,
          type: nextType,
          connection_type: targetNet.net_type || 'signal',
          signal_name: targetNet.name,
          label: targetNet.name,
          user_corrected: true,
        }
        : connection
    )));
    applyNetPatch(selectedPersistedNetId, { status: 'hidden', user_corrected: true });
    applyNetPatch(targetNet.id, { member_connection_ids: targetMemberIds, user_corrected: true });
    setNetMergeDraft(EMPTY_NET_MERGE_DRAFT);
    setSelectedNetId(persistedNetNodeId(targetNet.id));

    void mergeNets(designId, { target_net_id: targetNet.id, source_net_ids: [selectedPersistedNetId] })
      .then(applyNetResponseAndRefresh)
      .catch((error) => console.error('Failed to merge nets', error));
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, netMergeDraft.targetNetId, persistedNets, selectedNetBlock, selectedPersistedNetId]);
  const handleAddNetLink = useCallback(() => {
    if (!selectedNetBlock || !netLinkDraft.from || !netLinkDraft.to || netLinkDraft.from === netLinkDraft.to) {
      return;
    }
    if (!netLinkDraft.sourcePin || !netLinkDraft.targetPin) {
      return;
    }

    const netLabel = selectedNetBlock.reference || selectedNetBlock.partNumber || selectedNetBlock.id.replace(/^net:/, '');
    const netType = String(selectedNetBlock.specs?.netType || 'signal');
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    const connectionType = toArchitectureConnectionType(netType);
    const sourcePin = netLinkDraft.sourcePin || undefined;
    const targetPin = netLinkDraft.targetPin || undefined;
    const exists = connections.some((connection) => (
      connection.from === netLinkDraft.from &&
      connection.to === netLinkDraft.to &&
      String(connection.signal_name || connection.label || '').toLowerCase() === String(netLabel).toLowerCase()
    ));
    if (exists) return;

    const newConnection: ConnectionData = {
      id: `conn-${netLinkDraft.from}-${netLinkDraft.to}-${Date.now()}`,
      net_id: persistedNetId || undefined,
      from: netLinkDraft.from,
      to: netLinkDraft.to,
      type: connectionType,
      connection_type: netType,
      signal_name: netLabel,
      label: netLabel,
      source_pin: sourcePin,
      target_pin: targetPin,
      from_pin: sourcePin,
      to_pin: targetPin,
      pin_resolution_source: 'manual',
      user_corrected: true,
      edgeType: 'smoothstep',
    };

    setConnections((prev) => [...prev, newConnection]);
    void persistNewConnection(newConnection);
    setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
  }, [connections, netLinkDraft, persistNewConnection, selectedNetBlock]);

  const handleApplyNetEdit = useCallback(() => {
    if (!selectedNetBlock) return;
    const nextLabel = netEditDraft.label.trim();
    if (!nextLabel) return;
    const nextRawType = String(netEditDraft.type || 'signal').trim() || 'signal';
    const nextType = toArchitectureConnectionType(nextRawType);
    const memberIds = new Set(selectedNetBlock.connections);
    const persistedNetId = getPersistedNetId(selectedNetBlock);

    setConnections((prev) => prev.map((connection) => (
      memberIds.has(connection.id)
        ? {
          ...connection,
          type: nextType,
          connection_type: nextRawType,
          signal_name: nextLabel,
          label: nextLabel,
        }
        : connection
    )));

    if (persistedNetId) {
      applyNetPatch(persistedNetId, { name: nextLabel, net_type: nextRawType, user_corrected: true });
      if (designId) {
        void updateNet(designId, persistedNetId, { name: nextLabel, net_type: nextRawType })
          .then(applyNetResponseAndRefresh)
          .catch((error) => console.error('Failed to persist net edit', error));
      }
    }

    setSelectedNetId(null);
    setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
    setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, netEditDraft, selectedNetBlock]);

  const handleHideSelectedNet = useCallback(() => {
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    if (persistedNetId) {
      applyNetPatch(persistedNetId, { status: 'ungrouped', user_corrected: true });
      if (designId) {
        void deleteNet(designId, persistedNetId, 'ungroup')
          .then(applyNetResponseAndRefresh)
          .catch((error) => console.error('Failed to ungroup net', error));
      }
    } else {
      const netKey = String(selectedNetBlock?.specs?.netKey || '');
      if (!netKey) return;
      setHiddenNetKeys((prev) => new Set(prev).add(netKey));
    }
    setSelectedNetId(null);
    setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
    setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, selectedNetBlock]);

  const handleDeleteSelectedNetLinks = useCallback(() => {
    if (!selectedNetBlock) return;
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    const memberIds = new Set(selectedNetBlock.connections);
    setConnections((prev) => prev.filter((connection) => !memberIds.has(connection.id)));
    if (persistedNetId) {
      applyNetPatch(persistedNetId, {
        status: 'rejected',
        user_corrected: true,
        member_connection_ids: [],
        members: [],
      });
      if (designId) {
        void deleteNet(designId, persistedNetId, 'delete_links')
          .then(applyNetResponseAndRefresh)
          .catch((error) => console.error('Failed to delete net links', error));
      }
    }
    setSelectedNetId(null);
    setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
    setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, selectedNetBlock]);

  const confirmNetById = useCallback((netId: string) => {
    if (!netId) return;
    applyNetPatch(netId, { status: 'confirmed', user_corrected: true });
    setNetReviewWarning(null);
    if (designId) {
      void confirmNet(designId, netId)
        .then(applyNetResponseAndRefresh)
        .then(() => onRefreshCompletionReadiness?.())
        .catch((error) => console.error('Failed to confirm net', error));
    }
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, onRefreshCompletionReadiness]);

  const rejectNetById = useCallback((netId: string) => {
    if (!netId) return;
    applyNetPatch(netId, { status: 'rejected', user_corrected: true });
    setNetReviewWarning(null);
    if (designId) {
      void rejectNet(designId, netId)
        .then(applyNetResponseAndRefresh)
        .then(() => onRefreshCompletionReadiness?.())
        .catch((error) => console.error('Failed to reject net', error));
    }
    setSelectedNetId(null);
    setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
    setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, onRefreshCompletionReadiness]);

  const handleConfirmSelectedNet = useCallback(() => {
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    if (!persistedNetId) return;
    confirmNetById(persistedNetId);
  }, [confirmNetById, selectedNetBlock]);

  const handleRejectSelectedNet = useCallback(() => {
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    if (!persistedNetId) return;
    rejectNetById(persistedNetId);
  }, [rejectNetById, selectedNetBlock]);
  const handleUpdateConnection = useCallback((id: string, updates: Partial<ConnectionData>) => {
    setConnections((prev) => 
      prev.map((conn) => 
        conn.id === id 
          ? { ...conn, ...updates }
          : conn
      )
    );
  }, []);

  const removeConnectionFromCanvas = useCallback((connectionId: string) => {
    const connection = connections.find((candidate) => candidate.id === connectionId);
    setConnections((prev) => prev.filter((candidate) => candidate.id !== connectionId));

    if (!connection?.net_id) return;

    const net = persistedNets.find((candidate) => candidate.id === connection.net_id);
    if (!net) return;

    applyNetPatch(net.id, {
      member_connection_ids: (net.member_connection_ids || []).filter((id) => id !== connectionId),
      members: (net.members || []).filter((member) => member.id !== connectionId),
      user_corrected: true,
    });
  }, [applyNetPatch, connections, persistedNets]);

  const handleDeleteConnection = useCallback((id: string) => {
    if (!isPersistedConnectionId(id)) {
      pendingDeletedLocalConnectionIdsRef.current.add(id);
    }
    removeConnectionFromCanvas(id);
    setEdges((prev) => prev.filter((edge) => {
      const connectionId = edge.data && typeof edge.data.connectionId === 'string'
        ? edge.data.connectionId
        : null;
      return edge.id !== id && connectionId !== id;
    }));
    setSelectedEdgeId(null); // Clear selection after deletion
    if (designId && isPersistedConnectionId(id)) {
      void deleteConnectionApi(designId, id)
        .catch((error) => console.error('Failed to delete connection', error));
    }
  }, [designId, removeConnectionFromCanvas, setEdges]);

  const handleRemoveNetMember = useCallback((connectionId: string) => {
    const persistedNetId = getPersistedNetId(selectedNetBlock);
    if (!persistedNetId || !designId || !isPersistedConnectionId(connectionId)) {
      handleDeleteConnection(connectionId);
      return;
    }

    const currentNet = persistedNets.find((net) => net.id === persistedNetId);
    const nextMemberIds = selectedNetBlock?.connections.filter((id) => id !== connectionId) || [];
    setConnections((prev) => prev.map((connection) => (
      connection.id === connectionId
        ? { ...connection, net_id: undefined, user_corrected: true }
        : connection
    )));
    applyNetPatch(persistedNetId, {
      member_connection_ids: nextMemberIds,
      members: (currentNet?.members || []).filter((member) => member.id !== connectionId),
      user_corrected: true,
    });

    void removeNetMember(designId, persistedNetId, connectionId)
      .then(applyNetResponseAndRefresh)
      .catch((error) => console.error('Failed to remove net member', error));
  }, [applyNetPatch, applyNetResponseAndRefresh, designId, handleDeleteConnection, persistedNets, selectedNetBlock]);
  const handleConnectionPatch = useCallback(async (id: string, updates: Partial<ConnectionData>) => {
    const hasSourcePin = Object.prototype.hasOwnProperty.call(updates, 'source_pin') || Object.prototype.hasOwnProperty.call(updates, 'from_pin');
    const hasTargetPin = Object.prototype.hasOwnProperty.call(updates, 'target_pin') || Object.prototype.hasOwnProperty.call(updates, 'to_pin');
    const patch = {
      ...updates,
      ...(hasSourcePin ? { from_pin: updates.source_pin || updates.from_pin } : {}),
      ...(hasTargetPin ? { to_pin: updates.target_pin || updates.to_pin } : {}),
    };
    setConnections((prev) =>
      prev.map((conn) => conn.id === id ? { ...conn, ...patch } : conn)
    );
    if (designId && isPersistedConnectionId(id)) {
      try {
        const apiPatch = {
          ...(hasSourcePin ? { source_pin: patch.source_pin || patch.from_pin || null } : {}),
          ...(hasTargetPin ? { target_pin: patch.target_pin || patch.to_pin || null } : {}),
          pin_resolution_source: patch.pin_resolution_source || 'manual',
          user_corrected: true,
        };
        await updateConnection(designId, id, apiPatch);
        await onRefreshCompletionReadiness?.();
      } catch (error) {
        console.error('Failed to persist connection pin edit', error);
      }
    }
  }, [designId, onRefreshCompletionReadiness]);

  const handleApplyAssistantProposal = useCallback(async (proposal: ArchitectureAssistantProposal): Promise<string> => {
    if (!designId) {
      throw new Error('Open a saved design before applying architecture proposals.');
    }

    const payload = proposalPayload(proposal);
    const action = getProposalAction(proposal);
    const config = getProposalConfig(action);
    if (!config.applyable) {
      return 'This proposal is review-only. Dismiss it when you are done with it.';
    }
    validateProposalPayload(proposal);

    const targetNetId = getProposalTargetNetId(proposal);
    const connectionIds = getProposalConnectionIds(proposal);
    const sourceNetIds = getProposalSourceNetIds(proposal);
    const findNet = (netId: string) => persistedNets.find((net) => net.id === netId);
    const markProposalApplied = async (message: string, resultPayload: Record<string, unknown> = {}) => {
      if (!proposal.id) return message;
      try {
        await applyArchitectureProposal(designId, proposal.id, {
          action,
          ...resultPayload,
        });
        return message;
      } catch (error) {
        console.warn('Architecture proposal applied but history update failed', error);
        return `${message} Proposal history could not be updated.`;
      }
    };
    const netMemberIds = (netId: string) => {
      const net = findNet(netId);
      if (!net) return [];
      return net.member_connection_ids?.length
        ? net.member_connection_ids
        : (net.members || []).map((member) => member.id);
    };

    type ApplyResult = {
      message: string;
      connection?: { net_id?: string | null } | null;
    };

    const refreshAfterProposalApply = async (result: ApplyResult) => {
      const shouldRefreshNets = config.refreshAfterApply.includes('nets')
        || Boolean(config.conditionalNetRefresh && result.connection?.net_id);
      if (shouldRefreshNets) {
        await refreshAuthoritativeNets();
      }
      if (config.refreshAfterApply.includes('readiness')) {
        await onRefreshCompletionReadiness?.();
      }
    };

    const applyRenameOrTypeProposal = async (): Promise<ApplyResult> => {
      const patch: Partial<ArchitectureNet> = {};
      const nextName = proposalString(payload.name);
      const nextType = proposalString(payload.net_type);
      if (nextName) patch.name = nextName;
      if (nextType) patch.net_type = nextType;

      const updatedNet = await updateNet(designId, targetNetId, patch);
      applyNetResponse(updatedNet);
      const memberIds = new Set(netMemberIds(targetNetId));
      const updatedType = updatedNet.net_type || nextType || 'signal';
      const mappedType = toArchitectureConnectionType(updatedType);
      setConnections((prev) => prev.map((connection) => (
        memberIds.has(connection.id)
          ? {
            ...connection,
            signal_name: updatedNet.name || connection.signal_name,
            label: updatedNet.name || connection.label,
            connection_type: updatedType,
            type: mappedType,
            user_corrected: true,
          }
          : connection
      )));
      setNetReviewWarning(null);
      return {
        message: await markProposalApplied(action === 'rename_net' ? 'Net renamed.' : 'Net type updated.', { target_net_id: targetNetId }),
      };
    };

    const applySplitNetProposal = async (): Promise<ApplyResult> => {
      const sourceMembers = netMemberIds(targetNetId);
      const name = proposalString(payload.name) || proposalString(proposal.title) || 'Split net';
      const newNet = await splitNet(designId, targetNetId, { name, connection_ids: connectionIds });
      const nextType = toArchitectureConnectionType(newNet.net_type || 'signal');
      setConnections((prev) => prev.map((connection) => (
        connectionIds.includes(connection.id)
          ? {
            ...connection,
            net_id: newNet.id,
            signal_name: newNet.name,
            label: newNet.name,
            connection_type: newNet.net_type || 'signal',
            type: nextType,
            user_corrected: true,
          }
          : connection
      )));
      applyNetPatch(targetNetId, {
        member_connection_ids: sourceMembers.filter((id) => !connectionIds.includes(id)),
        user_corrected: true,
      });
      applyNetResponse(newNet);
      setSelectedNetId(persistedNetNodeId(newNet.id));
      setNetReviewWarning(null);
      return {
        message: await markProposalApplied('Net split applied.', { target_net_id: targetNetId, created_net_id: newNet.id, connection_ids: connectionIds }),
      };
    };

    const applyMergeNetsProposal = async (): Promise<ApplyResult> => {
      const targetNet = findNet(targetNetId);
      if (!targetNet) throw new Error('Target net was not found in this diagram.');
      const movedMemberIds = sourceNetIds.flatMap(netMemberIds);
      const targetMemberIds = Array.from(new Set([...(targetNet.member_connection_ids || []), ...movedMemberIds]));
      const mergedNet = await mergeNets(designId, { target_net_id: targetNetId, source_net_ids: sourceNetIds });
      const nextType = toArchitectureConnectionType(mergedNet.net_type || targetNet.net_type || 'signal');
      setConnections((prev) => prev.map((connection) => (
        movedMemberIds.includes(connection.id)
          ? {
            ...connection,
            net_id: mergedNet.id,
            signal_name: mergedNet.name,
            label: mergedNet.name,
            connection_type: mergedNet.net_type || targetNet.net_type || 'signal',
            type: nextType,
            user_corrected: true,
          }
          : connection
      )));
      sourceNetIds.forEach((sourceNetId) => applyNetPatch(sourceNetId, { status: 'hidden', user_corrected: true }));
      applyNetPatch(mergedNet.id, { member_connection_ids: targetMemberIds, user_corrected: true });
      applyNetResponse(mergedNet);
      setSelectedNetId(persistedNetNodeId(mergedNet.id));
      setNetReviewWarning(null);
      return {
        message: await markProposalApplied('Nets merged.', { target_net_id: targetNetId, source_net_ids: sourceNetIds }),
      };
    };

    const applyAddMemberProposal = async (): Promise<ApplyResult> => {
      const targetNet = findNet(targetNetId);
      if (!targetNet) throw new Error('Target net was not found in this diagram.');
      const nextType = toArchitectureConnectionType(targetNet.net_type || 'signal');
      setConnections((prev) => prev.map((connection) => (
        connectionIds.includes(connection.id)
          ? {
            ...connection,
            net_id: targetNet.id,
            signal_name: targetNet.name,
            label: targetNet.name,
            connection_type: targetNet.net_type || 'signal',
            type: nextType,
            user_corrected: true,
          }
          : connection
      )));
      for (const connectionId of connectionIds) {
        const updatedNet = await addNetMember(designId, targetNet.id, connectionId);
        applyNetResponse(updatedNet);
      }
      applyNetPatch(targetNet.id, {
        member_connection_ids: Array.from(new Set([...(targetNet.member_connection_ids || []), ...connectionIds])),
        user_corrected: true,
      });
      setNetReviewWarning(null);
      return {
        message: await markProposalApplied('Member links added.', { target_net_id: targetNetId, connection_ids: connectionIds }),
      };
    };

    const applyRemoveMemberProposal = async (): Promise<ApplyResult> => {
      const currentMemberIds = netMemberIds(targetNetId);
      setConnections((prev) => prev.map((connection) => (
        connectionIds.includes(connection.id)
          ? { ...connection, net_id: undefined, user_corrected: true }
          : connection
      )));
      for (const connectionId of connectionIds) {
        const updatedNet = await removeNetMember(designId, targetNetId, connectionId);
        applyNetResponse(updatedNet);
      }
      applyNetPatch(targetNetId, {
        member_connection_ids: currentMemberIds.filter((id) => !connectionIds.includes(id)),
        user_corrected: true,
      });
      setNetReviewWarning(null);
      return {
        message: await markProposalApplied('Member links removed.', { target_net_id: targetNetId, connection_ids: connectionIds }),
      };
    };

    const applyResolvePinProposal = async (): Promise<ApplyResult> => {
      const sourcePin = proposalString(payload.source_pin);
      const targetPin = proposalString(payload.target_pin);
      const targetProposalId = proposalString(payload.proposal_id);
      const targetCandidate = unresolvedConnectionCandidates.find((candidate) => candidate.proposal_id === targetProposalId);
      const resultPayload = {
        source_pin: sourcePin,
        target_pin: targetPin,
        connection_type: proposalString(payload.connection_type) || targetCandidate?.connection_type || 'signal',
        signal_name: proposalString(payload.signal_name) || targetCandidate?.signal_name || undefined,
        pin_reasoning: proposalString(payload.pin_reasoning) || proposal.reasoning,
        pin_confidence: typeof payload.pin_confidence === 'number' ? payload.pin_confidence : proposal.confidence,
        confidence: proposal.confidence,
        pin_resolution_source: 'manual',
      };
      const result = await applyArchitectureProposalWithResult(designId, targetProposalId, resultPayload);
      const mapped = result.connection ? mapApiConnections([result.connection])[0] : undefined;
      if (mapped) {
        setConnections((prev) => (
          prev.some((connection) => connection.id === mapped.id) ? prev : [...prev, mapped]
        ));
      }
      setUnresolvedConnectionCandidates((prev) => prev.filter((candidate) => candidate.proposal_id !== targetProposalId));
      setUnresolvedPinDrafts((prev) => {
        const next = { ...prev };
        for (const candidate of unresolvedConnectionCandidates) {
          if (candidate.proposal_id === targetProposalId) delete next[candidate.id];
        }
        return next;
      });
      return {
        message: await markProposalApplied('Pin mapping applied.', { proposal_id: targetProposalId, source_pin: sourcePin, target_pin: targetPin }),
        connection: result.connection || null,
      };
    };

    const proposalHandlers: Partial<Record<ProposalAction, () => Promise<ApplyResult>>> = {
      rename_net: applyRenameOrTypeProposal,
      change_net_type: applyRenameOrTypeProposal,
      split_net: applySplitNetProposal,
      merge_nets: applyMergeNetsProposal,
      add_member: applyAddMemberProposal,
      remove_member: applyRemoveMemberProposal,
      resolve_pin: applyResolvePinProposal,
    };
    const handler = proposalHandlers[action];
    if (!handler) throw new Error(`Unsupported architecture proposal action: ${action}`);

    const result = await handler();
    await refreshAfterProposalApply(result);
    return result.message;
  }, [
    applyNetPatch,
    applyNetResponse,
    designId,
    onRefreshCompletionReadiness,
    persistedNets,
    refreshAuthoritativeNets,
    unresolvedConnectionCandidates,
  ]);

  const handleDismissAssistantProposal = useCallback(async (proposal: ArchitectureAssistantProposal): Promise<string> => {
    if (!designId) {
      throw new Error('Open a saved design before dismissing architecture proposals.');
    }
    if (!proposal.id) {
      throw new Error('Proposal is missing its saved ID.');
    }
    await dismissArchitectureProposal(designId, proposal.id, {
      dismissed_from: 'architecture_assistant',
      action: proposal.action || 'flag_issue',
    });
    const config = getProposalConfig(proposal);
    if (config.refreshAfterDismiss.includes('nets')) {
      await refreshAuthoritativeNets();
    }
    if (config.refreshAfterDismiss.includes('readiness')) {
      await onRefreshCompletionReadiness?.();
    }
    return 'Proposal dismissed.';
  }, [designId, onRefreshCompletionReadiness, refreshAuthoritativeNets]);

  // Handler to delete connection from edge
  const handleDeleteEdge = useCallback((edgeId: string) => {
    const connectionId = getConnectionIdForEdge(edgeId);
    if (connectionId) handleDeleteConnection(connectionId);
  }, [getConnectionIdForEdge, handleDeleteConnection]);

  useEffect(() => {
    edgeDeleteHandlerRef.current = handleDeleteEdge;
  }, [handleDeleteEdge]);

  const stages = [
    'Analyzing component types...',
    'Detecting power domains...',
    'Mapping signal flows...',
    'Computing optimal layout...',
    'Generating block diagram...'
  ];

  if (isAnalyzing) {
    return (
      <div className="h-full overflow-y-auto p-8 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="w-full max-w-2xl mx-auto">

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8"
          >
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-200 text-sm font-medium">
                  {stages[analysisStage]}
                </span>
                <span className="text-purple-200 text-sm font-medium">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                />
              </div>
                  </div>
                </motion.div>
      </div>
    </div>
  );
  }

  return (
    <div className="h-full w-full flex">
      <style>{`
        .react-flow__edges {
          z-index: 0 !important;
        }
        .react-flow__edge {
          z-index: 0 !important;
        }
        .react-flow__edge-path {
          stroke-width: 2.5px;
          pointer-events: stroke;
        }
        .react-flow__edge:hover .react-flow__edge-path {
          stroke-width: 3.5px;
          opacity: 1;
        }
        .react-flow__nodes {
          z-index: 2 !important;
        }
        .react-flow__node {
          z-index: 2 !important;
        }
        .react-flow__node-component,
        .react-flow__node-net {
          filter: drop-shadow(0 0 0 white) drop-shadow(0 0 7px rgba(255,255,255,0.96));
        }
        .react-flow__edge-label {
          z-index: 3 !important;
        }
      `}</style>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onMoveEnd={handleMoveEnd}
        onInit={(instance) => setZoomLevel(instance.getZoom())}
        onPaneClick={() => {
          setSelectedEdgeId(null);
          setSelectedNetId(null);
          setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
          setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
          setOpenConnectionTypeDropdown(false);
          setShowAddConnectionType(false);
        }}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={architectureEdgeTypes}
        connectionMode={ConnectionMode.Strict}
        minZoom={MIN_CANVAS_ZOOM}
        maxZoom={MAX_CANVAS_ZOOM}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={canMoveNodes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        className="bg-gray-50"
      >
        <Background color="#e5e7eb" gap={16} />
        <MiniMap 
          pannable
          zoomable
          maskColor="rgba(15, 23, 42, 0.08)"
          nodeColor={(node) => {
            if (node.type === 'net') return '#0ea5e9';
            const data = node.data as unknown as Partial<ComponentBlock>;
            const nodeType = String(data.type || data.category || '').toLowerCase();
            if (nodeType.includes('regulator') || nodeType.includes('ldo')) return '#a855f7';
            if (nodeType.includes('battery') || nodeType.includes('charger')) return '#22c55e';
            if (nodeType.includes('converter')) return '#f59e0b';
            if (nodeType.includes('protection')) return '#ef4444';
            if (nodeType.includes('communication')) return '#3b82f6';
            return '#6b7280';
          }}
          className="bg-white border border-gray-200 rounded-lg"
        />
        <Panel position="bottom-center" className="m-4">
          <ArchitectureAssistantPanel
            designId={designId}
            selectedNetId={selectedPersistedNetId || selectedNetId}
            selectedConnectionId={getConnectionIdForEdge(selectedEdgeId)}
            reviewRequiredCount={completionBlockers.length}
            nets={persistedNets}
            onApplyProposal={handleApplyAssistantProposal}
            onDismissProposal={handleDismissAssistantProposal}
          />
        </Panel>
        <Panel position="bottom-left" className="m-4">
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              title="Zoom out"
              onClick={handleZoomOut}
              disabled={zoomLevel <= MIN_CANVAS_ZOOM + 0.01}
              className="flex h-9 w-9 items-center justify-center border-r border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              <ZoomOutIcon className="h-4 w-4" />
            </button>
            <div className="min-w-[58px] px-3 text-center text-xs font-semibold tabular-nums text-gray-600">
              {Math.round(zoomLevel * 100)}%
            </div>
            <button
              type="button"
              title="Zoom in"
              onClick={handleZoomIn}
              disabled={zoomLevel >= MAX_CANVAS_ZOOM - 0.01}
              className="flex h-9 w-9 items-center justify-center border-l border-r border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              <ZoomInIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Fit architecture"
              onClick={handleFitCanvas}
              className="flex h-9 w-9 items-center justify-center border-r border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Pan canvas"
              onClick={() => setCanvasMode('pan')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                canvasMode === 'pan'
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Hand className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Move parts"
              onClick={() => setCanvasMode('move')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                canvasMode === 'move'
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
          </div>
        </Panel>
        <Panel position="top-right" className="m-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              onClick={() => setIsBuilderMode(!isBuilderMode)}
              variant={isBuilderMode ? "default" : "outline"}
              className="gap-2"
            >
              <Settings2 className="h-4 w-4" />
              {isBuilderMode ? 'Exit Builder' : 'Builder Mode'}
            </Button>
            {fundamentalIds && (
              <Button
                onClick={() => setViewMode(v => v === 'all' ? 'fundamental' : 'all')}
                variant={viewMode === 'fundamental' ? "default" : "outline"}
                size="sm"
                className="gap-2"
                title={viewMode === 'fundamental' ? 'Showing fundamental parts only ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â click to show all' : 'Click to show fundamental parts only'}
              >
                {viewMode === 'fundamental' ? `Fundamental (${fundamentalIds.size})` : `All (${nodes.length})`}
              </Button>
            )}
            <Button
              onClick={() => void handleComplete()}
              className="gap-2"
              disabled={!canCompleteArchitecture}
              title={completionWarning || undefined}
            >
              <CheckCircle className="h-4 w-4" />
              Complete Architecture
            </Button>
          </div>
          {completionBlockers.length > 0 && (
            <div className="max-h-[420px] w-[520px] overflow-y-auto rounded-lg border border-amber-200 bg-white px-3 py-3 text-xs text-slate-700 shadow-sm">
              <div className="font-bold text-amber-900">Architecture review queue</div>
              <div className="mt-1 text-amber-700">{completionWarning}</div>
              <div className="mt-3 space-y-2">
                {completionBlockers.map((blocker, index) => {
                  const isSuggestedNet = blocker.type === 'suggested_net';
                  const isPinlessConnection = blocker.type === 'pinless_connection';
                  const payload = blocker.payload || {};
                  const blockerId = blocker.id ? String(blocker.id) : '';
                  const signal = String(payload.signal_name || payload.name || '').trim();
                  const endpointLabel = [payload.source_mpn, payload.target_mpn]
                    .filter((value) => typeof value === 'string' && value.trim().length > 0)
                    .join(' -> ');
                  return (
                    <div key={`${blocker.type}-${blockerId || index}`} className="rounded-md border border-amber-100 bg-amber-50/60 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              {isSuggestedNet ? 'Suggested net' : isPinlessConnection ? 'Missing pins' : blocker.type}
                            </span>
                            {signal && <span className="truncate font-mono text-[11px] text-slate-500">{signal}</span>}
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">{blocker.label}</div>
                          {endpointLabel && <div className="mt-0.5 text-[11px] text-slate-500">{endpointLabel}</div>}
                          {isPinlessConnection && (
                            <div className="mt-1 text-[11px] text-amber-700">
                              Source pin: {String(payload.source_pin || 'missing')} · Target pin: {String(payload.target_pin || 'missing')}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={!blockerId}
                            onClick={() => focusBlocker(blocker)}
                          >
                            Focus
                          </Button>
                          {isSuggestedNet && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={!blockerId}
                                onClick={() => confirmNetById(blockerId)}
                              >
                                Confirm
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                disabled={!blockerId}
                                onClick={() => rejectNetById(blockerId)}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {unresolvedConnectionCandidates.length > 0 && (
            <div className="max-h-[360px] w-[420px] overflow-y-auto rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800 shadow-sm">
              <div className="font-semibold">
                {unresolvedConnectionCandidates.length} unresolved connection candidate{unresolvedConnectionCandidates.length === 1 ? '' : 's'} need pin mapping.
              </div>
              <div className="mt-1 text-amber-700">
                They are hidden from the graph until both endpoint pins are assigned.
              </div>
              <div className="mt-3 space-y-3">
                {unresolvedConnectionCandidates.map((candidate) => {
                  const sourceBlock = findBlockByPart(candidate.source_part);
                  const targetBlock = findBlockByPart(candidate.target_part);
                  const sourceOptions = getPinOptions(sourceBlock);
                  const targetOptions = getPinOptions(targetBlock);
                  const draft = unresolvedPinDrafts[candidate.id] || { sourcePin: '', targetPin: '' };
                  const sourceValue = draft.sourcePin || getPinSelectValue(sourceBlock, candidate.source_pin);
                  const targetValue = draft.targetPin || getPinSelectValue(targetBlock, candidate.target_pin);
                  const canResolve = Boolean(designId && sourceValue && targetValue);
                  const pendingAction = pendingUnresolvedAction?.id === candidate.id
                    ? pendingUnresolvedAction.action
                    : null;

                  return (
                    <div key={candidate.id} className="rounded-md border border-amber-100 bg-amber-50/60 p-2">
                      <div className="font-semibold text-slate-900">
                        {candidate.source_part} to {candidate.target_part}
                      </div>
                      {(candidate.signal_name || candidate.connection_type) && (
                        <div className="mt-0.5 text-[11px] text-amber-700">
                          {[candidate.signal_name, candidate.connection_type].filter(Boolean).join(' / ')}
                        </div>
                      )}
                      {candidate.reasoning && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{candidate.reasoning}</div>
                      )}
                      <div className={`mt-2 grid gap-2 ${candidate.proposal_id ? 'grid-cols-[1fr_1fr_auto_auto]' : 'grid-cols-[1fr_1fr_auto]'}`}>
                        <select
                          value={sourceValue}
                          onChange={(event) => handleUnresolvedPinDraftChange(candidate.id, 'sourcePin', event.target.value)}
                          className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs text-slate-800"
                          disabled={sourceOptions.length === 0 || pendingAction !== null}
                        >
                          <option value="">{sourceOptions.length ? 'Source pin' : 'No source pins'}</option>
                          {sourceOptions.map((pin) => (
                            <option key={`${candidate.id}-source-${pin.value}`} value={pin.value}>{pin.label}</option>
                          ))}
                        </select>
                        <select
                          value={targetValue}
                          onChange={(event) => handleUnresolvedPinDraftChange(candidate.id, 'targetPin', event.target.value)}
                          className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs text-slate-800"
                          disabled={targetOptions.length === 0 || pendingAction !== null}
                        >
                          <option value="">{targetOptions.length ? 'Target pin' : 'No target pins'}</option>
                          {targetOptions.map((pin) => (
                            <option key={`${candidate.id}-target-${pin.value}`} value={pin.value}>{pin.label}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleResolveUnresolvedConnection(candidate)}
                          disabled={!canResolve || pendingAction !== null}
                        >
                          {pendingAction === 'create' ? 'Saving' : 'Create'}
                        </Button>
                        {candidate.proposal_id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDismissUnresolvedConnection(candidate)}
                            disabled={pendingAction !== null}
                          >
                            {pendingAction === 'dismiss' ? 'Dismissing' : 'Dismiss'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {netReviewWarning && (
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700 shadow-sm">
              {netReviewWarning}
            </div>
          )}
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Create net</div>
            <div className="grid grid-cols-[160px_120px_auto] gap-2">
              <Input
                value={newNetDraft.name}
                onChange={(event) => setNewNetDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="VBAT, 5V, CAN"
                className="h-8 text-xs"
              />
              <select
                value={newNetDraft.type}
                onChange={(event) => setNewNetDraft((draft) => ({ ...draft, type: event.target.value }))}
                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
              >
                {connectionTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateNet}
                disabled={!designId || !newNetDraft.name.trim()}
              >
                Create
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {hiddenNetKeys.size > 0 && (
              <Button
                onClick={() => setHiddenNetKeys(new Set())}
                variant="outline"
                size="sm"
                className="gap-2"
                title="Restore generated net groupings hidden with Ungroup"
              >
                Regroup nets ({hiddenNetKeys.size})
              </Button>
            )}
            {blocks.length > 0 && (
              <Button
                onClick={() => {
                  const layoutRunId = ++layoutRunRef.current;
                  setLayoutType('random');
                  const nextNetModel = buildArchitectureNetModel(blocks, connections, hiddenNetKeys, persistedNets);
                  const layoutBlocks = [...blocks, ...nextNetModel.virtualNetBlocks];
                  const componentIds = new Set(blocks.map((block) => block.id));
                  // Re-apply layout to existing blocks - this will generate new random positions
                  const fallbackLayoutBlocks = applyLayout('random', layoutBlocks, nextNetModel.renderConnections);
                  const fallbackBlocks = splitComponentAndNetBlocks(fallbackLayoutBlocks, componentIds);
                  if (layoutRunId !== layoutRunRef.current) return;
                  setBlocks(fallbackBlocks.componentBlocks);
                  setVirtualNetBlocks(fallbackBlocks.virtualBlocks);
                  persistLayoutSnapshot(fallbackBlocks.componentBlocks, fallbackBlocks.virtualBlocks);
                  void applyElkLayout(layoutBlocks, nextNetModel.renderConnections)
                    .then((laidOutBlocks) => splitComponentAndNetBlocks(laidOutBlocks, componentIds))
                    .then((laidOutBlocks) => {
                      if (layoutRunId === layoutRunRef.current) {
                        setBlocks(laidOutBlocks.componentBlocks);
                        setVirtualNetBlocks(laidOutBlocks.virtualBlocks);
                        persistLayoutSnapshot(laidOutBlocks.componentBlocks, laidOutBlocks.virtualBlocks);
                      }
                    })
                    .catch((error) => {
                      console.warn('ELK layout failed; using fallback layout', error);
                    })
                    .finally(() => {
                      setTimeout(() => {
                        if (layoutRunId !== layoutRunRef.current) return;
                        fitView({ padding: 0.32, duration: 300 });
                      }, 100);
                    });
                }}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Shuffle className="h-4 w-4" />
                Rearrange
              </Button>
            )}
          </div>
        </Panel>

        {selectedNetBlock && !selectedEdgeId && (() => {
          const netLabel = selectedNetBlock.reference || selectedNetBlock.partNumber || selectedNetBlock.id.replace(/^net:/, '');
          const netType = String(selectedNetBlock.specs?.netType || 'signal');
          const sourceBlock = blocks.find((block) => block.id === netLinkDraft.from);
          const targetBlock = blocks.find((block) => block.id === netLinkDraft.to);
          const canAddNetLink = Boolean(
            netLinkDraft.from &&
            netLinkDraft.to &&
            netLinkDraft.from !== netLinkDraft.to &&
            netLinkDraft.sourcePin &&
            netLinkDraft.targetPin
          );

          return (
            <Panel position="top-left" className="m-4">
              <div className="max-h-[calc(100vh-120px)] w-[390px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      {selectedNetBlock.specs?.isPersistedNet ? 'Persisted net' : 'Generated net'}
                    </div>
                    <div className="mt-1 text-lg font-bold text-gray-950">{netLabel}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      This is a visual grouping of real pin-to-pin links sharing the same signal name.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      setSelectedNetId(null);
                      setNetLinkDraft(EMPTY_NET_LINK_DRAFT);
                      setNetEditDraft(EMPTY_NET_EDIT_DRAFT);
                    }}
                    title="Close net inspector"
                  >
                    ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{netType}</span>
                  <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                    {selectedNetMembers.length} member links
                  </span>
                  {Boolean(selectedNetBlock.specs?.isPersistedNet) && (
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
                      {String(selectedNetBlock.specs?.netStatus || 'suggested')}
                    </span>
                  )}
                </div>

                {Boolean(selectedNetBlock.specs?.isPersistedNet) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleConfirmSelectedNet}
                    >
                      Confirm net
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={handleRejectSelectedNet}
                      title="Reject this grouping but keep its real links visible directly"
                    >
                      Reject grouping
                    </Button>
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Customize net</div>
                  <div className="mt-3 grid grid-cols-[1fr_120px] gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      Net label
                      <Input
                        value={netEditDraft.label}
                        onChange={(event) => setNetEditDraft((draft) => ({ ...draft, label: event.target.value }))}
                        className="mt-1 h-8 text-xs"
                        placeholder={netLabel}
                      />
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Type
                      <select
                        value={netEditDraft.type}
                        onChange={(event) => setNetEditDraft((draft) => ({ ...draft, type: event.target.value }))}
                        className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                      >
                        {connectionTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyNetEdit}
                      disabled={!netEditDraft.label.trim()}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleHideSelectedNet}
                      title="Hide this generated grouping but keep its real connections"
                    >
                      Ungroup
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={handleDeleteSelectedNetLinks}
                      title="Delete all real member links in this net"
                    >
                      Delete links
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Add link to {netLabel}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      From part
                      <select
                        value={netLinkDraft.from}
                        onChange={(event) => setNetLinkDraft((draft) => ({
                          ...draft,
                          from: event.target.value,
                          sourcePin: '',
                        }))}
                        className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                      >
                        <option value="">Select</option>
                        {blocks.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.partNumber || block.reference || block.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      To part
                      <select
                        value={netLinkDraft.to}
                        onChange={(event) => setNetLinkDraft((draft) => ({
                          ...draft,
                          to: event.target.value,
                          targetPin: '',
                        }))}
                        className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                      >
                        <option value="">Select</option>
                        {blocks.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.partNumber || block.reference || block.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      From pin
                      <select
                        value={netLinkDraft.sourcePin}
                        onChange={(event) => setNetLinkDraft((draft) => ({ ...draft, sourcePin: event.target.value }))}
                        className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                        disabled={!sourceBlock}
                      >
                        <option value="">Unresolved</option>
                        {getPinOptions(sourceBlock).map((pin) => (
                          <option key={`${pin.number}-${pin.value}`} value={pin.value}>
                            {pin.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      To pin
                      <select
                        value={netLinkDraft.targetPin}
                        onChange={(event) => setNetLinkDraft((draft) => ({ ...draft, targetPin: event.target.value }))}
                        className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                        disabled={!targetBlock}
                      >
                        <option value="">Unresolved</option>
                        {getPinOptions(targetBlock).map((pin) => (
                          <option key={`${pin.number}-${pin.value}`} value={pin.value}>
                            {pin.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    size="sm"
                    disabled={!canAddNetLink}
                    onClick={handleAddNetLink}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add real connection to {netLabel}
                  </Button>
                </div>

                {selectedPersistedNetId && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Assign existing link</div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={netAssignDraft.connectionId}
                        onChange={(event) => setNetAssignDraft({ connectionId: event.target.value })}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
                      >
                        <option value="">Select direct link</option>
                        {assignableConnections.map((connection) => {
                          const fromLabel = blocks.find((block) => block.id === connection.from)?.partNumber || connection.from;
                          const toLabel = blocks.find((block) => block.id === connection.to)?.partNumber || connection.to;
                          const signalLabel = connection.signal_name || connection.label || connection.type;
                          return (
                            <option key={connection.id} value={connection.id}>
                              {fromLabel} to {toLabel} Ãƒâ€šÃ‚Â· {signalLabel}
                            </option>
                          );
                        })}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAssignExistingLink}
                        disabled={!netAssignDraft.connectionId}
                      >
                        Assign
                      </Button>
                    </div>
                    {assignableConnections.length === 0 && (
                      <div className="mt-2 text-[11px] text-gray-500">No ungrouped direct links are available.</div>
                    )}
                  </div>
                )}

                {selectedPersistedNetId && selectedNetMembers.length > 1 && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Split net</div>
                    <Input
                      value={netSplitDraft.name}
                      onChange={(event) => setNetSplitDraft((draft) => ({ ...draft, name: event.target.value }))}
                      className="mt-3 h-8 text-xs"
                      placeholder={`${netLabel} branch`}
                    />
                    <div className="mt-3 max-h-32 space-y-1 overflow-y-auto pr-1">
                      {selectedNetMembers.map((connection) => {
                        const fromLabel = blocks.find((block) => block.id === connection.from)?.partNumber || connection.from;
                        const toLabel = blocks.find((block) => block.id === connection.to)?.partNumber || connection.to;
                        return (
                          <label key={connection.id} className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
                            <input
                              type="checkbox"
                              checked={netSplitDraft.connectionIds.includes(connection.id)}
                              onChange={() => handleToggleSplitConnection(connection.id)}
                            />
                            <span className="min-w-0 truncate">{fromLabel} to {toLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      className="mt-3 w-full"
                      size="sm"
                      variant="outline"
                      onClick={handleSplitSelectedNet}
                      disabled={!netSplitDraft.name.trim() || netSplitDraft.connectionIds.length === 0 || netSplitDraft.connectionIds.length >= selectedNetMembers.length}
                    >
                      Split selected links
                    </Button>
                  </div>
                )}

                {selectedPersistedNetId && mergeTargetNets.length > 0 && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Merge net</div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={netMergeDraft.targetNetId}
                        onChange={(event) => setNetMergeDraft({ targetNetId: event.target.value })}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
                      >
                        <option value="">Merge into...</option>
                        {mergeTargetNets.map((net) => (
                          <option key={net.id} value={net.id}>
                            {net.name} Ãƒâ€šÃ‚Â· {net.net_type}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleMergeSelectedNet}
                        disabled={!netMergeDraft.targetNetId}
                      >
                        Merge
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Member links</div>
                  <div className="space-y-2">
                    {selectedNetMembers.map((connection) => {
                      const fromLabel = blocks.find((block) => block.id === connection.from)?.partNumber || connection.from;
                      const toLabel = blocks.find((block) => block.id === connection.to)?.partNumber || connection.to;
                      return (
                        <div key={connection.id} className="rounded-md border border-gray-200 bg-white p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-gray-900">
                                {fromLabel}{' -> '}{toLabel}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-gray-500">
                                {(connection.source_pin || connection.from_pin || 'pin ?')}{' -> '}{(connection.target_pin || connection.to_pin || 'pin ?')}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-xs"
                              onClick={() => handleRemoveNetMember(connection.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {selectedNetMembers.length === 0 && (
                      <div className="rounded-md border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                        No member links remain for this net.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          );
        })()}
        
        {/* Edge Type Selection Panel */}
        {selectedEdgeId && (() => {
          const selectedEdge = edges.find(e => e.id === selectedEdgeId);
          if (!selectedEdge) return null;
          
          // Find the connection for this edge
          const selectedConnectionId = getConnectionIdForEdge(selectedEdgeId);
          const connection = connections.find(conn => conn.id === selectedConnectionId);
          
          const currentEdgeType = connection?.edgeType || 'default';
          const currentConnectionType = connection?.type || 'signal';
          const sourceBlock = blocks.find((block) => block.id === connection?.from);
          const targetBlock = blocks.find((block) => block.id === connection?.to);
          const sourcePinOptions = getPinOptions(sourceBlock);
          const targetPinOptions = getPinOptions(targetBlock);
          const sourcePinValue = getPinSelectValue(sourceBlock, connection?.source_pin || connection?.from_pin);
          const targetPinValue = getPinSelectValue(targetBlock, connection?.target_pin || connection?.to_pin);
          
          return (
            <Panel position="top-left" className="m-4">
              <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-4 min-w-[280px] max-w-[360px] space-y-4">
                {connection && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-gray-700">Pin Mapping</h3>
                    <div className="grid grid-cols-1 gap-2">
                      <label className="text-xs text-gray-500">
                        Source pin
                        <select
                          value={sourcePinValue}
                          onChange={(e) => handleConnectionPatch(connection.id, {
                            source_pin: e.target.value || undefined,
                            from_pin: e.target.value || undefined,
                            pin_resolution_source: 'manual',
                            user_corrected: true,
                          })}
                          className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                        >
                          <option value="">Unresolved</option>
                          {sourcePinOptions.map((pin) => (
                            <option key={`${pin.number}-${pin.value}`} value={pin.value}>
                              {pin.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-gray-500">
                        Target pin
                        <select
                          value={targetPinValue}
                          onChange={(e) => handleConnectionPatch(connection.id, {
                            target_pin: e.target.value || undefined,
                            to_pin: e.target.value || undefined,
                            pin_resolution_source: 'manual',
                            user_corrected: true,
                          })}
                          className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                        >
                          <option value="">Unresolved</option>
                          {targetPinOptions.map((pin) => (
                            <option key={`${pin.number}-${pin.value}`} value={pin.value}>
                              {pin.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      {connection.pin_confidence != null ? (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                          pin confidence {Math.round(connection.pin_confidence * 100)}%
                        </span>
                      ) : (
                        <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                          unresolved pins
                        </span>
                      )}
                      {connection.user_corrected && (
                        <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">user corrected</span>
                      )}
                    </div>
                    {connection.pin_reasoning && (
                      <p className="mt-2 text-xs text-gray-500">{connection.pin_reasoning}</p>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid="delete-pin-connection"
                      className="mt-3 w-full justify-center"
                      onClick={() => {
                        setOpenConnectionTypeDropdown(false);
                        setShowAddConnectionType(false);
                        handleDeleteConnection(connection.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete pin connection
                    </Button>
                  </div>
                )}
                {/* Connection Type Section */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-gray-700">Connection Type</h3>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenConnectionTypeDropdown(!openConnectionTypeDropdown);
                        setShowAddConnectionType(false);
                      }}
                      className="h-9 w-full px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex items-center justify-between gap-2 transition-all shadow-sm hover:shadow"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm shrink-0"
                          style={{ backgroundColor: getConnectionTypeColor(currentConnectionType, customConnectionTypeColors) }}
                        />
                        <span className="text-sm font-medium text-gray-700 truncate">
                          {currentConnectionType.charAt(0).toUpperCase() + currentConnectionType.slice(1).replace(/_/g, ' ')}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-gray-500 shrink-0 transition-transform duration-200 ${openConnectionTypeDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {openConnectionTypeDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => {
                            setOpenConnectionTypeDropdown(false);
                            setShowAddConnectionType(false);
                          }}
                        />
                        <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-hidden flex flex-col">
                          <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #f3f4f6' }}>
                            <div className="py-1">
                    {connectionTypes.map((type) => (
                                <div key={type} className="flex items-center group">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleConnectionTypeChange(selectedEdgeId, type);
                                      setOpenConnectionTypeDropdown(false);
                                      setShowAddConnectionType(false);
                                    }}
                                    className={`w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-all ${
                                      currentConnectionType === type
                                        ? 'bg-blue-50 text-blue-700 font-medium'
                                        : 'hover:bg-gray-50 text-gray-700'
                                    }`}
                                  >
                                    <div
                                      className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm shrink-0"
                                      style={{ backgroundColor: getConnectionTypeColor(type, customConnectionTypeColors) }}
                                    />
                                    <span className="flex-1">{type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')}</span>
                                    {currentConnectionType === type && (
                                      <span className="text-blue-600 font-semibold text-base">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ</span>
                                    )}
                                  </button>
                                  {customConnectionTypes.includes(type) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveConnectionType(type);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 px-2 text-red-500 hover:text-red-700 text-xs transition-opacity"
                                      title="Remove custom type"
                                    >
                                      ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="border-t border-gray-200 pt-2 pb-2 flex-shrink-0">
                            {showAddConnectionType ? (
                              <div className="px-3 pb-2 flex gap-2">
                                <Input
                                  value={newConnectionType}
                                  onChange={(e) => setNewConnectionType(e.target.value)}
                                  placeholder="New type"
                                  className="h-8 text-sm flex-1 border-gray-300 rounded-lg"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleAddConnectionType();
                                    } else if (e.key === 'Escape') {
                                      setShowAddConnectionType(false);
                                      setNewConnectionType('');
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleAddConnectionType}
                                  className="h-8 px-3 text-sm rounded-lg"
                                >
                                  Add
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setShowAddConnectionType(false);
                                    setNewConnectionType('');
                                  }}
                                  className="h-8 w-8 p-0 rounded-lg"
                                >
                                  ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowAddConnectionType(true)}
                                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-blue-600 font-medium transition-colors rounded-b-lg"
                              >
                                <Plus className="h-4 w-4" />
                                <span>Add custom type</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Preview of connection style */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-xs text-gray-500">Style:</div>
                    <div className="flex items-center gap-1 flex-1">
                      <div
                        className="h-2 flex-1 rounded"
                        style={{
                          borderBottomColor: getEdgeColor(currentConnectionType),
                          borderBottomStyle: getEdgeStyle(currentConnectionType).strokeDasharray ? 'dashed' : 'solid',
                          borderBottomWidth: 2,
                        }}
                      />
                      <span className="text-xs text-gray-400">
                        {getEdgeStyle(currentConnectionType).strokeDasharray ? 'Dashed' : 'Solid'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Edge Type Section */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-gray-700">Edge Type</h3>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => handleEdgeTypeChange(selectedEdgeId, 'default')}
                      variant={currentEdgeType === 'default' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Default (Bezier)
                    </Button>
                    <Button
                      onClick={() => handleEdgeTypeChange(selectedEdgeId, 'straight')}
                      variant={currentEdgeType === 'straight' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Straight
                    </Button>
                    <Button
                      onClick={() => handleEdgeTypeChange(selectedEdgeId, 'step')}
                      variant={currentEdgeType === 'step' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Step
                    </Button>
                    <Button
                      onClick={() => handleEdgeTypeChange(selectedEdgeId, 'smoothstep')}
                      variant={currentEdgeType === 'smoothstep' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Smooth Step
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })()}
      </ReactFlow>
      
      {/* Builder Sidebar */}
      {isBuilderMode && (
        <ArchitectureBuilderSidebar
          blocks={blocks}
          connections={connections}
          onAddComponent={handleAddComponent}
          onUpdateComponent={handleUpdateComponent}
          onDeleteComponent={handleDeleteComponent}
          onAddConnection={handleAddConnection}
          onUpdateConnection={handleUpdateConnection}
          onDeleteConnection={handleDeleteConnection}
          onClose={() => setIsBuilderMode(false)}
        />
      )}

      {designId && selectedModelMpn && (
        <PartModelDrawer
          mpn={selectedModelMpn}
          designId={designId}
          isOpen={Boolean(selectedModelMpn)}
          onClose={() => setSelectedModelMpn(null)}
          side="left"
        />
      )}
    </div>
  );
}

// Wrapper component that provides ReactFlow context
export function SystemArchitectureView({ components, onArchitectureComplete, backendResponse, initialConnections, initialUnresolvedConnections, initialNets, completionReadiness, classificationMap, designId, layoutScopeId, onRefreshNets, onRefreshCompletionReadiness }: SystemArchitectureViewProps) {
  return (
    <ReactFlowProvider>
      <SystemArchitectureViewInner
        components={components}
        onArchitectureComplete={onArchitectureComplete}
        backendResponse={backendResponse}
        initialConnections={initialConnections}
        initialUnresolvedConnections={initialUnresolvedConnections}
        initialNets={initialNets}
        completionReadiness={completionReadiness}
        classificationMap={classificationMap}
        designId={designId}
        layoutScopeId={layoutScopeId}
        onRefreshNets={onRefreshNets}
        onRefreshCompletionReadiness={onRefreshCompletionReadiness}
      />
    </ReactFlowProvider>
  );
}
