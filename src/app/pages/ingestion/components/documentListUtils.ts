export const DOCUMENT_PARSE_STATUS_STYLES = {
  parsing: 'border-blue-200 bg-blue-50 text-blue-800',
  parsed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
  stored: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;

export type DocumentParseStatus = keyof typeof DOCUMENT_PARSE_STATUS_STYLES;

export function resolveDocumentParseStatus(
  parseJobStatus: string | undefined,
  chunkCount: number | null,
): { status: DocumentParseStatus; label: string } {
  if (parseJobStatus === 'queued' || parseJobStatus === 'running') {
    return { status: 'parsing', label: 'Parsing…' };
  }
  if (parseJobStatus === 'failed') {
    return { status: 'failed', label: 'Parse failed' };
  }
  if (parseJobStatus === 'succeeded' || (chunkCount !== null && chunkCount > 0)) {
    const suffix = chunkCount !== null ? ` · ${chunkCount} table${chunkCount === 1 ? '' : 's'}` : '';
    return { status: 'parsed', label: `Ready${suffix}` };
  }
  return { status: 'stored', label: 'Stored' };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
