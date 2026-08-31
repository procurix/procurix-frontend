export const CHUNK_STATUS_STYLES = {
  parsed: 'border-slate-200 bg-slate-50 text-slate-700',
  committed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
} as const;

export type ChunkLifecycleStatus = keyof typeof CHUNK_STATUS_STYLES;

export function chunkDisplayTitle(
  metadata: Record<string, unknown> | undefined,
  chunkId: string,
): string {
  const title = metadata?.title;
  if (typeof title === 'string' && title.trim()) return title;
  return `Table ${chunkId.slice(0, 8)}…`;
}

export function cloneTableContent<T extends { columns: string[]; rows: unknown[] }>(
  content: T,
): T {
  return {
    ...content,
    columns: [...content.columns],
    rows: content.rows.map((row) => ({ ...(row as Record<string, unknown>) })),
  } as T;
}
