import type { ChunkTableContent } from '@/app/services/api/ingestion';

export interface FactEvidenceItem {
  evidence_type?: string;
  text?: string;
  source_ref?: string;
}

export interface TableCellHighlight {
  rowId: number;
  column: string;
}

export interface TableEvidenceHighlight {
  rowIds: number[];
  cells: TableCellHighlight[];
  /** Column names whose header and cells should be highlighted (typical for metrics). */
  columns: string[];
  scrollToRowId: number | null;
}

const EMPTY_HIGHLIGHT: TableEvidenceHighlight = {
  rowIds: [],
  cells: [],
  columns: [],
  scrollToRowId: null,
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeColumnLabel(value: string): string {
  return normalize(value).replace(/%/g, ' percent');
}

function cellsMatchEvidence(cellValue: string, evidenceText: string): boolean {
  const cell = normalize(cellValue);
  const evidence = normalize(evidenceText);
  if (!cell || !evidence) return false;
  return evidence.includes(cell) || cell.includes(evidence);
}

function columnsMatch(label: string, columnName: string): boolean {
  const a = normalizeColumnLabel(label);
  const b = normalizeColumnLabel(columnName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function findMatchingColumns(content: ChunkTableContent, label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];
  return content.columns.filter((column) => columnsMatch(trimmed, column));
}

function parseLabelValue(text: string): { label: string; value: string } | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?)\s*[:=\-–]\s*(.+)$/);
  if (!match) return null;
  const label = match[1].trim();
  const value = match[2].trim();
  if (!label || !value) return null;
  return { label, value };
}

/** Parse row ids from structured refs like `chunk:{id}:row:3` or free text like `AVL row 1`. */
export function parseRowIdsFromSourceRef(sourceRef: string, chunkId: string): number[] {
  const ref = sourceRef.trim();
  if (!ref) return [];

  const structured = [...ref.matchAll(/(?:^|:)row:(\d+)/gi)].map((match) => Number(match[1]));
  if (structured.length) return structured;

  if (ref.includes(chunkId)) {
    const scoped = [...ref.matchAll(/row[:\s#-]*(\d+)/gi)].map((match) => Number(match[1]));
    if (scoped.length) return scoped;
  }

  const loose = [...ref.matchAll(/\brow\s*[#:-]?\s*(\d+)/gi)].map((match) => Number(match[1]));
  return loose;
}

type HighlightAccumulator = {
  rowIds: Set<number>;
  cells: TableCellHighlight[];
  cellKeys: Set<string>;
  columns: Set<string>;
};

function createAccumulator(): HighlightAccumulator {
  return { rowIds: new Set(), cells: [], cellKeys: new Set(), columns: new Set() };
}

function addCell(acc: HighlightAccumulator, rowId: number, column: string) {
  acc.rowIds.add(rowId);
  const key = `${rowId}:${column}`;
  if (acc.cellKeys.has(key)) return;
  acc.cellKeys.add(key);
  acc.cells.push({ rowId, column });
}

function scopedRows(content: ChunkTableContent, rowScope: number[]) {
  return rowScope.length
    ? content.rows.filter((row) => rowScope.includes(row._row_id))
    : content.rows;
}

function applyColumnLabel(
  acc: HighlightAccumulator,
  content: ChunkTableContent,
  label: string,
  rowScope: number[],
) {
  const matchedColumns = findMatchingColumns(content, label);
  for (const column of matchedColumns) {
    acc.columns.add(column);
    for (const row of scopedRows(content, rowScope)) {
      addCell(acc, row._row_id, column);
    }
  }
}

function applyCellText(
  acc: HighlightAccumulator,
  content: ChunkTableContent,
  text: string,
  rowScope: number[],
) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const parsed = parseLabelValue(trimmed);
  if (parsed) {
    applyColumnLabel(acc, content, parsed.label, rowScope);
    applyCellText(acc, content, parsed.value, rowScope);
    return;
  }

  for (const row of scopedRows(content, rowScope)) {
    for (const column of content.columns) {
      const cellValue = String(row[column] ?? '').trim();
      if (!cellValue || !cellsMatchEvidence(cellValue, trimmed)) continue;
      addCell(acc, row._row_id, column);
    }
  }
}

function applyEvidenceItem(
  acc: HighlightAccumulator,
  content: ChunkTableContent,
  item: FactEvidenceItem,
  chunkId: string,
) {
  const ref = String(item.source_ref ?? '');
  const text = String(item.text ?? '').trim();
  const rowScope = parseRowIdsFromSourceRef(ref, chunkId);
  rowScope.forEach((rowId) => acc.rowIds.add(rowId));

  if (text) {
    applyCellText(acc, content, text, rowScope);
  } else if (rowScope.length) {
    for (const rowId of rowScope) {
      for (const column of content.columns) {
        addCell(acc, rowId, column);
      }
    }
  }
}

function finalizeHighlight(acc: HighlightAccumulator): TableEvidenceHighlight {
  const rowIdList = [...acc.rowIds];
  return {
    rowIds: rowIdList,
    cells: acc.cells,
    columns: [...acc.columns],
    scrollToRowId: rowIdList[0] ?? acc.cells[0]?.rowId ?? null,
  };
}

export function computeEvidenceHighlight(
  evidence: FactEvidenceItem[] | undefined,
  content: ChunkTableContent | null,
  chunkId: string,
): TableEvidenceHighlight {
  if (!evidence?.length || !content) return { ...EMPTY_HIGHLIGHT };

  const acc = createAccumulator();
  for (const item of evidence) {
    applyEvidenceItem(acc, content, item, chunkId);
  }
  return finalizeHighlight(acc);
}

/** Highlight table cells from fact evidence and/or the mention's raw text. */
export function computeMentionSourceHighlight(
  evidence: FactEvidenceItem[] | undefined,
  mentionText: string | undefined,
  content: ChunkTableContent | null,
  chunkId: string,
  entityKind?: string,
): TableEvidenceHighlight {
  if (!content) return { ...EMPTY_HIGHLIGHT };

  const acc = createAccumulator();
  for (const item of evidence ?? []) {
    applyEvidenceItem(acc, content, item, chunkId);
  }

  const mention = String(mentionText ?? '').trim();
  if (mention) {
    const isMetric = entityKind === 'metric';
    if (isMetric) {
      applyColumnLabel(acc, content, mention, [...acc.rowIds]);
      applyCellText(acc, content, mention, [...acc.rowIds]);
    } else {
      applyCellText(acc, content, mention, [...acc.rowIds]);
      applyColumnLabel(acc, content, mention, [...acc.rowIds]);
    }
  }

  return finalizeHighlight(acc);
}

export function factHasEvidence(
  evidence: FactEvidenceItem[] | undefined,
): boolean {
  return Boolean(
    evidence?.some(
      (item) => String(item.text ?? '').trim() || String(item.source_ref ?? '').trim(),
    ),
  );
}

export function hasTableHighlight(
  highlight: TableEvidenceHighlight | null | undefined,
): boolean {
  if (!highlight) return false;
  return (
    highlight.rowIds.length > 0 || highlight.cells.length > 0 || highlight.columns.length > 0
  );
}
