export type ChunkFlowTab = 'table' | 'facts' | 'terms';

export function buildDocumentWorkspaceHref(
  documentId: string,
  chunkId?: string,
  tab?: ChunkFlowTab,
): string {
  const params = new URLSearchParams();
  if (chunkId) params.set('chunk', chunkId);
  if (tab) params.set('tab', tab);
  const query = params.toString();
  return `/ingestion/documents/${documentId}${query ? `?${query}` : ''}`;
}
