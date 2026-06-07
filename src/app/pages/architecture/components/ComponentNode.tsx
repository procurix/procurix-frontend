import { useState, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronUp, Database, ExternalLink } from 'lucide-react';
import type { Component } from '@/app/types';

type PinSide = 'left' | 'right';

interface PinData {
  name: string;
  type: string;
  description: string;
}

interface ComponentNodeData extends Component {
  category?: string;
  quantity?: number;
  pinout?: Record<string, PinData>;
  activePinNames?: string[];
  subsystemName?: string;
  subsystemKey?: string | null;
  subsystemColor?: string;
  subsystemWarning?: boolean;
  onOpenModel?: (mpn: string) => void;
}

const SYMBOL_WIDTH = 390;
const PIN_ROW_HEIGHT = { collapsed: 34, expanded: 42 };
const PIN_AREA_PADDING_Y = 14;
const PIN_HANDLE_SIZE = 13;
const DETAIL_ROW_LIMIT = 8;

const URL_SPEC_KEYS = new Set([
  'Datasheet',
  'datasheet_url',
  'datasheetUrl',
  'Product',
  'product_url',
  'productUrl',
]);

const DETAIL_EXCLUDED_KEYS = new Set([
  ...URL_SPEC_KEYS,
  'Category',
  'Description',
  'Manufacturer',
  'Status',
  'Source',
  'Confidence',
  'Instance',
  'web_contributions',
  'datasheet_candidates_tried',
  'extraction_error',
  'nexar_fetched_at',
  'fetched_at',
]);

const DETAIL_PRIORITY_WORDS = [
  'function',
  'topology',
  'voltage',
  'current',
  'power',
  'frequency',
  'clock',
  'temperature',
  'tolerance',
  'package',
  'mount',
  'interface',
];

function normalizePinToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function expandPinTokens(value: unknown): string[] {
  const token = normalizePinToken(value);
  if (!token) return [];

  const tokens = new Set([token]);
  const pinMatch = token.match(/\bpin\s*[-#:]*\s*([a-z0-9]+)\b/i);
  if (pinMatch?.[1]) tokens.add(normalizePinToken(pinMatch[1]));

  return [...tokens];
}

function sortPins(pinout?: Record<string, PinData>): Array<[string, PinData]> {
  if (!pinout) return [];
  return Object.entries(pinout).sort(([a], [b]) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

function pinColor(pinType: string, active: boolean): string {
  if (!active) return '#94a3b8';
  const type = (pinType || '').toUpperCase();
  const colors: Record<string, string> = {
    INPUT: '#2563eb',
    OUTPUT: '#059669',
    POWER: '#d97706',
    GROUND: '#475569',
    ANALOG: '#7c3aed',
    DIGITAL: '#db2777',
  };
  return colors[type] ?? '#2563eb';
}

function getSpecValue(specs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = specs[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function isProbablyUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function humanizeSpecKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSpecValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const compact = value
      .map((item) => formatSpecValue(item))
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
    return compact || null;
  }
  return null;
}

function detailPriority(key: string): number {
  const lower = key.toLowerCase();
  const index = DETAIL_PRIORITY_WORDS.findIndex((word) => lower.includes(word));
  return index === -1 ? DETAIL_PRIORITY_WORDS.length : index;
}

function collectTechnicalDetails(specs: Record<string, unknown>): Array<{ key: string; value: string }> {
  const details: Array<{ key: string; value: string; priority: number }> = [];

  const addDetail = (key: string, value: unknown) => {
    if (DETAIL_EXCLUDED_KEYS.has(key) || isProbablyUrl(value)) return;
    const formatted = formatSpecValue(value);
    if (!formatted || formatted === '[object Object]') return;
    details.push({ key: humanizeSpecKey(key), value: formatted, priority: detailPriority(key) });
  };

  Object.entries(specs).forEach(([key, value]) => {
    if (key === 'params' && value && typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value as Record<string, unknown>).forEach(([paramKey, paramValue]) => {
        addDetail(paramKey, paramValue);
      });
      return;
    }
    addDetail(key, value);
  });

  const seen = new Set<string>();
  return details
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
    .filter((detail) => {
      const signature = `${detail.key}:${detail.value}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, DETAIL_ROW_LIMIT)
    .map(({ key, value }) => ({ key, value }));
}

export const ComponentNode = (props: NodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const data = props.data as unknown as ComponentNodeData;
  const selected = props.selected;

  const instanceMatch = data.id?.match(/_(\d+)$/);
  const isInstance = !!instanceMatch;
  const instanceIndex = instanceMatch ? parseInt(instanceMatch[1], 10) : null;
  const baseMpn = isInstance && data.id
    ? data.id.replace(/_\d+$/, '')
    : (data.partNumber || data.id);

  const category = formatSpecValue(data.specs?.Category) || data.category || data.type;
  const manufacturer = formatSpecValue(data.specs?.Manufacturer) || data.manufacturer;
  const description = formatSpecValue(data.specs?.Description) || data.description;
  const specs = (data.specs || {}) as Record<string, unknown>;
  const datasheetUrl = getSpecValue(specs, ['Datasheet', 'datasheet_url', 'datasheetUrl']);
  const productUrl = getSpecValue(specs, ['Product', 'product_url', 'productUrl']);
  const technicalDetails = collectTechnicalDetails(specs);
  const canOpenModel = Boolean(baseMpn && data.onOpenModel);
  const pinEntries = sortPins(data.pinout);
  const activePinTokens = new Set((data.activePinNames || []).flatMap(expandPinTokens));

  const isActivePin = (pinNumber: string, pin: PinData) => {
    if (activePinTokens.size === 0) return false;
    return (
      activePinTokens.has(normalizePinToken(pinNumber)) ||
      activePinTokens.has(normalizePinToken(pin.name))
    );
  };

  const activePinEntries = pinEntries.filter(([pinNumber, pin]) => isActivePin(pinNumber, pin));
  const visiblePins = isExpanded ? pinEntries : activePinEntries;
  const hasPinout = pinEntries.length > 0;
  const hasVisiblePins = visiblePins.length > 0;
  const hasEngineeringDetails = Boolean(
    description || datasheetUrl || productUrl || technicalDetails.length || canOpenModel
  );
  const canExpand = hasPinout || hasEngineeringDetails;
  const rowHeight = isExpanded ? PIN_ROW_HEIGHT.expanded : PIN_ROW_HEIGHT.collapsed;
  const splitIndex = Math.ceil(visiblePins.length / 2);
  const rowCount = Math.max(splitIndex, visiblePins.length - splitIndex, hasVisiblePins ? 1 : 0);
  const pinAreaHeight = hasVisiblePins
    ? PIN_AREA_PADDING_Y * 2 + rowCount * rowHeight
    : 70;

  const sideForIndex = (index: number): PinSide => (index < splitIndex ? 'left' : 'right');
  const rowForIndex = (index: number): number => (
    index < splitIndex ? index : index - splitIndex
  );

  const renderPinHandles = () => {
    if (!data.id || !hasVisiblePins) return null;
    const handles: ReactElement[] = [];

    visiblePins.forEach(([pinNumber, pin], index) => {
      const active = isActivePin(pinNumber, pin);
      if (!active && !isExpanded) return;

      const side = sideForIndex(index);
      const row = rowForIndex(index);
      const color = pinColor(pin.type, active);
      const top = `${PIN_AREA_PADDING_Y + row * rowHeight + rowHeight / 2}px`;
      const handleStyle = {
        top,
        width: `${PIN_HANDLE_SIZE}px`,
        height: `${PIN_HANDLE_SIZE}px`,
        borderRadius: '50%',
        backgroundColor: color,
        border: '2px solid white',
        opacity: active ? 1 : 0.65,
        boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
      };

      handles.push(
        <Handle
          key={`target-${pinNumber}`}
          id={`${data.id}-pin-${pinNumber}`}
          data-testid={`pin-handle-${data.id}-${pinNumber}-target`}
          type="target"
          position={side === 'left' ? Position.Left : Position.Right}
          style={{ ...handleStyle, opacity: 0, zIndex: 1 }}
        />
      );
      handles.push(
        <Handle
          key={`source-${pinNumber}`}
          id={`${data.id}-pin-${pinNumber}`}
          data-testid={`pin-handle-${data.id}-${pinNumber}-source`}
          type="source"
          position={side === 'left' ? Position.Left : Position.Right}
          style={{ ...handleStyle, zIndex: 2 }}
        />
      );
    });

    return <>{handles}</>;
  };

  const renderPinLabel = (
    pinNumber: string,
    pin: PinData,
    side: PinSide,
    active: boolean
  ) => {
    const color = pinColor(pin.type, active);
    const isLeft = side === 'left';
    const title = [
      `Pin ${pinNumber}: ${pin.name || 'Unnamed'}`,
      pin.type ? `Type: ${pin.type}` : null,
      active ? 'Connected' : 'Idle',
      pin.description || null,
    ].filter(Boolean).join('\n');

    return (
      <div
        className={`flex min-w-0 items-center gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}
        title={title}
      >
        {isLeft && (
          <span className="h-px w-7 shrink-0" style={{ backgroundColor: color, opacity: active ? 1 : 0.45 }} />
        )}
        <span
          className={`min-w-0 truncate text-xs leading-none ${
            active ? 'font-semibold text-slate-950' : 'font-medium text-slate-500'
          }`}
        >
          <span className="mr-1 text-[11px] text-slate-400">{pinNumber}</span>
          {pin.name || 'PIN'}
        </span>
        {isExpanded && pin.type && (
          <span className="max-w-[68px] shrink-0 truncate rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {pin.type}
          </span>
        )}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color, opacity: active ? 1 : 0.45 }}
        />
        {!isLeft && (
          <span className="h-px w-7 shrink-0" style={{ backgroundColor: color, opacity: active ? 1 : 0.45 }} />
        )}
      </div>
    );
  };

  return (
    <div
      data-architecture-node-id={data.id}
      data-testid={`architecture-node-${data.id}`}
      className={`relative overflow-visible rounded-md border bg-white shadow-sm transition-shadow ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-100'
          : data.subsystemWarning
            ? 'border-amber-400 ring-2 ring-amber-100'
            : 'border-slate-300'
      }`}
      style={{ width: SYMBOL_WIDTH, boxShadow: data.subsystemColor ? `inset 4px 0 0 ${data.subsystemColor}` : undefined }}
    >
      <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-wide text-slate-950" title={baseMpn}>
              {baseMpn}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500" title={category}>
              {category || 'Component'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {data.subsystemName && (
              <span
                className="max-w-[110px] truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                title={data.subsystemName}
                style={{ borderColor: data.subsystemColor || undefined }}
              >
                {data.subsystemKey || data.subsystemName}
              </span>
            )}
            {canOpenModel && (
              <button
                type="button"
                className="nodrag nopan inline-flex items-center gap-1 rounded border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 hover:border-indigo-200 hover:bg-indigo-100"
                title="Open structured part model"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onOpenModel?.(String(baseMpn));
                }}
              >
                <Database className="h-3 w-3" />
                Model
              </button>
            )}
            {isInstance && (
              <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                #{instanceIndex}
              </span>
            )}
          </div>
        </div>
        {manufacturer && (
          <div className="mt-1 truncate text-[11px] text-slate-400" title={manufacturer}>
            {manufacturer}
          </div>
        )}
      </div>

      <div
        className="relative border-b border-slate-300 bg-white"
        style={{ height: pinAreaHeight }}
        title={!isExpanded && hasPinout && !hasVisiblePins ? 'Expand pinout to access pin handles for wiring' : undefined}
      >
        {renderPinHandles()}

        {hasVisiblePins ? (
          visiblePins.map(([pinNumber, pin], index) => {
            const side = sideForIndex(index);
            const row = rowForIndex(index);
            const active = isActivePin(pinNumber, pin);
            const top = PIN_AREA_PADDING_Y + row * rowHeight;
            const widthClass = 'w-[48%]';
            const sideClass = side === 'left'
              ? `left-0 ${widthClass} pl-0 pr-4`
              : `right-0 ${widthClass} pl-4 pr-0`;

            return (
              <div
                key={`${side}-${pinNumber}`}
                className={`absolute flex items-center ${sideClass}`}
                style={{ top, height: rowHeight }}
              >
                {renderPinLabel(pinNumber, pin, side, active)}
              </div>
            );
          })
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs font-medium text-slate-400">
            No resolved pin mapping yet
          </div>
        )}
      </div>

      {isExpanded && hasEngineeringDetails && (
        <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Technical Evidence
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canOpenModel && (
                <button
                  type="button"
                  className="nodrag inline-flex items-center gap-1 rounded border border-indigo-100 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:border-indigo-200 hover:bg-indigo-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onOpenModel?.(String(baseMpn));
                  }}
                >
                  Model <Database className="h-3 w-3" />
                </button>
              )}
              {datasheetUrl && (
                <a
                  className="nodrag inline-flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:border-blue-200 hover:bg-blue-100"
                  href={datasheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  Datasheet <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {productUrl && (
                <a
                  className="nodrag inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  href={productUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  Product <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {description && (
            <p className="mt-2 text-xs leading-5 text-slate-600" title={String(description)}>
              {description}
            </p>
          )}

          {technicalDetails.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {technicalDetails.map((detail) => (
                <div key={`${detail.key}-${detail.value}`} className="min-w-0">
                  <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {detail.key}
                  </dt>
                  <dd className="mt-0.5 line-clamp-2 break-words text-[11px] font-medium leading-4 text-slate-700" title={detail.value}>
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {canExpand && (
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-b-md bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
          onClick={() => setIsExpanded((value) => !value)}
        >
          <span>
            {isExpanded ? 'Collapse Details' : hasPinout ? 'Expand Pinout & Specs' : 'Show Technical Details'}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            {hasPinout && `${activePinEntries.length}/${pinEntries.length} active`}
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      )}
    </div>
  );
};

ComponentNode.displayName = 'ComponentNode';
