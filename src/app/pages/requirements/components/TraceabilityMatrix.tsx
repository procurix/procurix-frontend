import { useEffect, useMemo, useState } from 'react';
import { Check, Download, ExternalLink, Link2, Rows3, Search, Target, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/app/shared/components/ui/utils';
import {
  getRequirementsTraceability,
  updateRequirement,
  type Requirement as APIRequirement,
  type TraceabilityCell,
  type TraceabilityColumn,
  type TraceabilityMatrixResponse,
  type TraceabilityRequirementRow,
} from '@/app/services/api';
import { SummaryCard } from './RequirementPrimitives';

type MatrixFilter = 'all' | 'untraced' | 'must-have' | 'missing-verification';

function confidenceLabel(value?: number | null): string {
  if (value == null) return '';
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${pct}%`;
}

function asRequirementPatch(columns: TraceabilityColumn[]): Partial<APIRequirement> {
  const unique = new Map<string, TraceabilityColumn>();
  columns.forEach(col => unique.set(`${col.type}::${col.id}`, col));
  const values = Array.from(unique.values());
  return {
    source_mpns: values.filter(col => col.type === 'component').map(col => col.id),
    source_standards: values.filter(col => col.type === 'standard').map(col => col.id),
  };
}

function matrixKey(requirementId: string, column: Pick<TraceabilityColumn, 'id' | 'type'>): string {
  return `${requirementId}::${column.type}::${column.id}`;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function TraceabilityMatrix({
  designId,
  onSelectRequirement,
  onOpenComponent,
  onChanged,
}: {
  designId: string;
  onSelectRequirement: (reqId: string) => void;
  onOpenComponent?: (mpn: string) => void;
  onChanged: () => void;
}) {
  const [matrix, setMatrix] = useState<TraceabilityMatrixResponse | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MatrixFilter>('all');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [impactOnly, setImpactOnly] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    getRequirementsTraceability(designId)
      .then(data => {
        if (isCurrent) setMatrix(data);
      })
      .catch(error => toast.error(error instanceof Error ? error.message : 'Failed to load traceability matrix'));
    return () => { isCurrent = false; };
  }, [designId]);

  const cellMap = useMemo(() => {
    const map = new Map<string, TraceabilityCell>();
    for (const cell of matrix?.cells ?? []) {
      map.set(matrixKey(cell.requirement_id, { id: cell.column_id, type: cell.column_type }), cell);
    }
    return map;
  }, [matrix]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (matrix?.requirements ?? []).filter(row => {
      const traced = (row.source_mpns?.length ?? 0) > 0 || (row.source_standards?.length ?? 0) > 0 || (row.sources?.length ?? 0) > 0;
      const hasImpact = traced || (row.gap_flags?.length ?? 0) > 0;
      if (impactOnly && !hasImpact) return false;
      if (filter === 'untraced' && traced) return false;
      if (filter === 'must-have' && row.priority !== 'must_have') return false;
      if (filter === 'missing-verification' && row.verification_method) return false;
      if (!q) return true;
      return [
        row.req_key,
        row.title,
        row.category,
        row.priority,
        row.status,
        ...(row.source_mpns ?? []),
        ...(row.source_standards ?? []),
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    });
  }, [matrix, query, filter, impactOnly]);

  const visibleColumns = useMemo(() => {
    if (!matrix || !impactOnly) return matrix?.columns ?? [];
    const visibleRequirementIds = new Set(filteredRows.map(row => row.req_id));
    return matrix.columns.filter(column => (
      matrix.cells.some(cell => (
        visibleRequirementIds.has(cell.requirement_id)
        && cell.column_id === column.id
        && cell.column_type === column.type
      ))
    ));
  }, [matrix, filteredRows, impactOnly]);

  const toggleCell = async (row: TraceabilityRequirementRow, column: TraceabilityColumn) => {
    if (!matrix) return;
    const key = matrixKey(row.req_id, column);
    const linked = cellMap.has(key);
    setSavingKey(key);
    try {
      const currentColumns = [
        ...(row.source_mpns ?? []).map(id => ({ id, label: id, type: 'component' as const })),
        ...(row.source_standards ?? []).map(id => ({ id, label: id, type: 'standard' as const })),
      ];
      const nextColumns = currentColumns.filter(col => (
        linked ? !(col.id === column.id && col.type === column.type) : true
      ));
      if (!linked) nextColumns.push(column);
      await updateRequirement(designId, row.req_id, asRequirementPatch(nextColumns));
      const refreshed = await getRequirementsTraceability(designId);
      setMatrix(refreshed);
      onChanged();
      toast.success(linked ? 'Trace link removed' : 'Trace link added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update trace link');
    } finally {
      setSavingKey(null);
    }
  };

  const exportCsv = () => {
    if (!matrix) return;
    const header = ['Requirement', 'Title', 'Status', 'Verification', ...visibleColumns.map(col => col.label)];
    const rows = filteredRows.map(row => [
      row.req_key || row.req_id,
      row.title || '',
      row.status || '',
      row.verification_method || '',
      ...visibleColumns.map(col => cellMap.has(matrixKey(row.req_id, col)) ? 'linked' : ''),
    ]);
    const csv = [header, ...rows].map(line => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `traceability-matrix-${designId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!matrix) {
    return <div className="p-8 text-sm text-gray-500">Loading traceability matrix...</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Traceability Matrix</h2>
            <p className="text-sm text-gray-500">Audit requirement coverage across source components and standards.</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <SummaryCard label="Traced" value={matrix.coverage.requirements_traced} tone="good" />
          <SummaryCard label="Untraced" value={matrix.coverage.requirements_untraced} tone={matrix.coverage.requirements_untraced ? 'warn' : 'good'} />
          <SummaryCard label="Missing Verification" value={matrix.coverage.missing_verification} tone={matrix.coverage.missing_verification ? 'warn' : 'good'} />
          <SummaryCard label="Components" value={matrix.coverage.components_total} />
          <SummaryCard label="Standards" value={matrix.coverage.standards_total} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search requirements or sources..."
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {([
            ['all', 'All'],
            ['untraced', 'Untraced'],
            ['must-have', 'Must-have'],
            ['missing-verification', 'Missing verification'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                filter === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCompact(value => !value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              compact ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            <Rows3 className="h-4 w-4" />
            Condensed
          </button>
          <button
            type="button"
            onClick={() => setImpactOnly(value => !value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              impactOnly ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            <Target className="h-4 w-4" />
            Impact only
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className={cn('min-w-full border-separate border-spacing-0', compact ? 'text-xs' : 'text-sm')}>
          <thead className="sticky top-0 z-10 bg-gray-100">
            <tr>
              <th className={cn(
                'sticky left-0 z-20 border-b border-r border-gray-200 bg-gray-100 text-left font-semibold text-gray-700',
                compact ? 'w-[260px] p-2' : 'w-[360px] p-3',
              )}>
                Requirement
              </th>
              {visibleColumns.map(column => (
                <th
                  key={`${column.type}-${column.id}`}
                  className={cn(
                    'border-b border-r border-gray-200 text-center font-semibold text-gray-600',
                    compact ? 'min-w-[42px] max-w-[42px] p-1 text-[10px]' : 'min-w-[120px] p-2 text-xs',
                  )}
                >
                  {column.type === 'component' && onOpenComponent ? (
                    <button
                      type="button"
                      onClick={() => onOpenComponent(column.id)}
                      className={cn(
                        'group mx-auto inline-flex items-center justify-center gap-1 text-blue-700 hover:text-blue-900',
                        compact ? 'max-w-[34px]' : 'max-w-[110px]',
                      )}
                      title={`Open part evidence for ${column.label}`}
                    >
                      <span className="truncate">{compact ? column.label.slice(0, 3).toUpperCase() : column.label}</span>
                      {!compact && <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />}
                    </button>
                  ) : (
                    <div className={cn('mx-auto truncate', compact ? 'max-w-[34px]' : 'max-w-[110px]')} title={column.label}>
                      {compact ? column.label.slice(0, 3).toUpperCase() : column.label}
                    </div>
                  )}
                  {!compact && <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">{column.type}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => (
              <tr key={row.req_id} className="bg-white hover:bg-gray-50">
                <td className={cn(
                  'sticky left-0 z-[5] border-b border-r border-gray-200 bg-inherit align-top',
                  compact ? 'p-2' : 'p-3',
                )}>
                  <button type="button" onClick={() => onSelectRequirement(row.req_id)} className="block text-left">
                    <div className="font-mono text-xs font-semibold text-gray-500">{row.req_key || row.req_id.slice(0, 8)}</div>
                    {!compact && (
                      <>
                        <div className="mt-1 line-clamp-2 font-semibold text-gray-950">{row.title || 'Untitled requirement'}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(row.gap_flags ?? []).slice(0, 3).map(gap => (
                            <span key={gap} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              {gap.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </button>
                </td>
                {visibleColumns.map(column => {
                  const key = matrixKey(row.req_id, column);
                  const cell = cellMap.get(key);
                  return (
                    <td
                      key={key}
                      className={cn(
                        'border-b border-r border-gray-200 text-center align-middle',
                        compact ? 'p-1' : 'p-2',
                      )}
                    >
                      <button
                        type="button"
                        disabled={savingKey === key}
                        onClick={() => toggleCell(row, column)}
                        className={cn(
                          'mx-auto flex items-center justify-center border transition-colors',
                          compact ? 'h-5 w-5 rounded-sm' : 'h-9 w-9 rounded-md',
                          cell
                            ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                            : 'border-gray-200 bg-white text-gray-300 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600',
                        )}
                        title={cell ? `Linked ${confidenceLabel(cell.confidence)}` : 'Click to link source'}
                      >
                        {cell ? (
                          <Check className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                        ) : (
                          <Link2 className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">No matrix rows match the current filters.</div>
        )}
        {filteredRows.length > 0 && visibleColumns.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">
            No linked source columns in the current impact view.
          </div>
        )}
      </div>
    </div>
  );
}
