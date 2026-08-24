import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { cn } from '@/app/shared/components/ui/utils';
import type { ChunkTableContent } from '@/app/services/api/ingestion';
import type { TableEvidenceHighlight } from './evidenceHighlightUtils';

interface EditableTableGridProps {
  content: ChunkTableContent;
  editable: boolean;
  onChange: (content: ChunkTableContent) => void;
  highlight?: TableEvidenceHighlight | null;
}

export function EditableTableGrid({
  content,
  editable,
  onChange,
  highlight,
}: EditableTableGridProps) {
  const columns = content.columns ?? [];
  const rows = content.rows ?? [];
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (highlight?.scrollToRowId == null) return;
    const row = rowRefs.current.get(highlight.scrollToRowId);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight?.scrollToRowId, highlight?.rowIds.join(','), highlight?.cells.length]);

  const highlightedCellKeys = new Set(
    (highlight?.cells ?? []).map((cell) => `${cell.rowId}:${cell.column}`),
  );
  const highlightedRowIds = new Set(highlight?.rowIds ?? []);
  const highlightedColumns = new Set(highlight?.columns ?? []);

  const updateCell = (rowId: number, column: string, value: string) => {
    onChange({
      ...content,
      rows: rows.map((row) =>
        row._row_id === rowId ? { ...row, [column]: value } : row,
      ),
    });
  };

  const addRow = () => {
    const nextId = Math.max(0, ...rows.map((row) => row._row_id ?? 0)) + 1;
    const row: Record<string, unknown> & { _row_id: number } = { _row_id: nextId };
    for (const column of columns) row[column] = '';
    onChange({
      ...content,
      rows: [...rows, row as ChunkTableContent['rows'][number]],
      row_count: rows.length + 1,
    });
  };

  const deleteRow = (rowId: number) => {
    const nextRows = rows.filter((row) => row._row_id !== rowId);
    onChange({
      ...content,
      rows: nextRows,
      row_count: nextRows.length,
    });
  };

  if (!columns.length) {
    return (
      <p className="text-sm text-slate-500">This chunk has no table columns.</p>
    );
  }

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Add row
          </Button>
        </div>
      )}
      <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50">
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-600">
                #
              </th>
              {columns.map((column) => {
                const columnHighlighted = highlightedColumns.has(column);
                return (
                  <th
                    key={column}
                    className={cn(
                      'border-b border-slate-200 px-3 py-2 text-left font-medium',
                      columnHighlighted
                        ? 'bg-amber-200 text-amber-950 ring-1 ring-inset ring-amber-400'
                        : 'text-slate-600',
                    )}
                  >
                    {column}
                  </th>
                );
              })}
              {editable && (
                <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-600">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowHighlighted = highlightedRowIds.has(row._row_id);
              const rowHasCellHighlights = columns.some((column) =>
                highlightedCellKeys.has(`${row._row_id}:${column}`),
              );

              return (
                <tr
                  key={row._row_id}
                  ref={(element) => {
                    if (element) rowRefs.current.set(row._row_id, element);
                    else rowRefs.current.delete(row._row_id);
                  }}
                  className={cn(
                    rowHighlighted && !rowHasCellHighlights && 'bg-amber-50',
                    rowHighlighted && rowHasCellHighlights && 'bg-amber-50/40',
                  )}
                >
                  <td
                    className={cn(
                      'border-b border-slate-100 px-3 py-1.5 text-xs',
                      rowHighlighted ? 'font-medium text-amber-800' : 'text-slate-400',
                    )}
                  >
                    {row._row_id}
                  </td>
                  {columns.map((column) => {
                    const cellHighlighted = highlightedCellKeys.has(`${row._row_id}:${column}`);
                    return (
                      <td
                        key={column}
                        className={cn(
                          'border-b border-slate-100 px-3 py-1.5',
                          cellHighlighted && 'bg-amber-200 ring-1 ring-inset ring-amber-400',
                        )}
                      >
                        {editable ? (
                          <input
                            type="text"
                            value={String(row[column] ?? '')}
                            onChange={(event) =>
                              updateCell(row._row_id, column, event.target.value)
                            }
                            className={cn(
                              'w-full min-w-[8rem] rounded border border-transparent bg-amber-50/80 px-2 py-1',
                              'focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400',
                            )}
                          />
                        ) : (
                          <span className={cn('text-slate-800', cellHighlighted && 'font-medium')}>
                            {String(row[column] ?? '')}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className="border-b border-slate-100 px-3 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => deleteRow(row._row_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="text-sm text-slate-500">No rows yet.{editable ? ' Add a row to start.' : ''}</p>
      )}
    </div>
  );
}
