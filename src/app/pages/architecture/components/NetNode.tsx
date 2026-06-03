import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Cable } from 'lucide-react';
import { VIRTUAL_NET_SOURCE_HANDLE, VIRTUAL_NET_TARGET_HANDLE } from '../utils/architectureNetModel';

export interface NetNodeData {
  label: string;
  netType: string;
  netKind?: string;
  connectionCount: number;
}

const NET_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  power: { border: '#fca5a5', bg: '#fff7f7', text: '#991b1b', dot: '#ef4444' },
  ground: { border: '#cbd5e1', bg: '#f8fafc', text: '#334155', dot: '#64748b' },
  data: { border: '#bfdbfe', bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  clock: { border: '#ddd6fe', bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' },
  control: { border: '#fed7aa', bg: '#fff7ed', text: '#9a3412', dot: '#f97316' },
  signal: { border: '#bae6fd', bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9' },
};

export function NetNode(props: NodeProps) {
  const data = props.data as unknown as NetNodeData;
  const palette = NET_COLORS[data.netType] ?? NET_COLORS.signal;
  const isRail = data.netKind === 'rail';

  return (
    <div
      data-architecture-node-id={props.id}
      className={`relative cursor-pointer rounded-full border bg-white px-3 py-1.5 shadow-sm transition-shadow ${
        props.selected ? 'ring-2 ring-blue-300' : 'hover:shadow-md'
      }`}
      style={{ width: 136, borderColor: palette.border, backgroundColor: palette.bg }}
      title={`Click to inspect ${data.label} ${isRail ? 'rail' : 'bus'} - ${data.connectionCount} connected links`}
    >
      <Handle
        id={VIRTUAL_NET_TARGET_HANDLE}
        type="target"
        position={Position.Left}
        style={{
          left: -6,
          width: 11,
          height: 11,
          borderRadius: '50%',
          border: '2px solid white',
          backgroundColor: palette.dot,
        }}
      />
      <Handle
        id={VIRTUAL_NET_SOURCE_HANDLE}
        type="source"
        position={Position.Right}
        style={{
          right: -6,
          width: 11,
          height: 11,
          borderRadius: '50%',
          border: '2px solid white',
          backgroundColor: palette.dot,
        }}
      />

      <div
        className="pointer-events-none absolute left-[-52px] right-[-52px] top-1/2 -z-10 -translate-y-1/2 rounded-full opacity-35"
        style={{
          backgroundColor: palette.dot,
          height: isRail ? 5 : 3,
          borderTop: isRail ? undefined : `1px dashed ${palette.dot}`,
        }}
      />

      <div className="flex items-center justify-center gap-2">
        <Cable className="h-3 w-3 shrink-0" style={{ color: palette.dot }} />
        <div className="min-w-0 text-center">
          <div className="truncate text-[11px] font-bold uppercase tracking-wide" style={{ color: palette.text }}>
            {data.label}
          </div>
        </div>
        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-slate-500">
          {data.connectionCount}
        </span>
      </div>
    </div>
  );
}

NetNode.displayName = 'NetNode';
