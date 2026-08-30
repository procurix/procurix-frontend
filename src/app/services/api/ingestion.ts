const INGESTION_BASE = (
  import.meta.env.VITE_INGESTION_API_URL || 'http://127.0.0.1:8100'
).replace(/\/$/, '');

export { INGESTION_BASE };

export interface IngestionCapabilities {
  database: boolean;
  parsing: boolean;
  agents: boolean;
  ner_schema: boolean;
  ner_bucket_service: boolean;
}

export interface IngestionHealthResponse {
  ok: boolean;
  capabilities: IngestionCapabilities;
}

export interface IngestionDocument {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  source_hash: string;
  metadata: Record<string, unknown>;
  storage_backend: string;
  storage_key: string;
  storage_uri: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface IngestionChunkLifecycle {
  id: string;
  document_id: string;
  chunk_type: string | null;
  content_hash: string;
  metadata: Record<string, unknown>;
  status: string;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface IngestionAgentSession {
  id: string;
  kind: string;
  scope_type: string;
  chunk_id: string | null;
  document_id: string;
  stage: string;
  status: string;
  pending_invocation_id: string | null;
  pending_calls: Record<string, unknown>[];
  last_error: string | null;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface IngestionJob {
  id: string;
  kind: string;
  document_id: string | null;
  chunk_id: string | null;
  session_id: string | null;
  status: string;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionChunkPipeline {
  chunk: IngestionChunkLifecycle;
  fact_session: IngestionAgentSession | null;
  fact_counts: Record<string, number>;
  ner_session: IngestionAgentSession | null;
  mention_count: number;
  bucket_count: number;
}

export interface IngestionDocumentPipeline {
  document: IngestionDocument;
  chunks: IngestionChunkPipeline[];
  jobs: IngestionJob[];
  totals: Record<string, number>;
}

export interface CommitChunkResult {
  chunk: IngestionChunkLifecycle;
  fact_session_id: string | null;
  fact_draft_job_id: string | null;
}

export interface ChunkTableContent {
  columns: string[];
  rows: Array<Record<string, unknown> & { _row_id: number }>;
  row_count?: number;
  column_count?: number;
  [key: string]: unknown;
}

export interface ChunkContentPutBody {
  content: ChunkTableContent;
  expected_version: number;
}

export interface WorkflowUploadResult {
  document: IngestionDocument;
  parse_job_id: string | null;
}

export interface ListIngestionJobsParams {
  kind?: string;
  status?: string;
  document_id?: string;
  chunk_id?: string;
  session_id?: string;
}

export interface UploadIngestionDocumentsOptions {
  sourceName?: string;
  parse?: boolean;
}

function formatIngestionError(status: number, payload: unknown, fallbackText: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === 'string') return `${status}: ${detail}`;
    return `${status}: ${JSON.stringify(detail)}`;
  }
  if (typeof payload === 'object' && payload && 'error' in payload) {
    return `${status}: ${String((payload as { error: unknown }).error)}`;
  }
  return `${status}: ${fallbackText}`;
}

export async function ingestionJSON<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${INGESTION_BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(formatIngestionError(response.status, payload, text || response.statusText));
  }

  return payload as T;
}

export function getIngestionHealth(): Promise<IngestionHealthResponse> {
  return ingestionJSON('/health');
}

export function listIngestionDocuments(): Promise<IngestionDocument[]> {
  return ingestionJSON('/documents');
}

export function getIngestionDocument(documentId: string): Promise<IngestionDocument> {
  return ingestionJSON(`/documents/${encodeURIComponent(documentId)}`);
}

export function getIngestionDocumentPipeline(
  documentId: string,
): Promise<IngestionDocumentPipeline> {
  return ingestionJSON(`/documents/${encodeURIComponent(documentId)}/pipeline`);
}

export function getIngestionJob(jobId: string): Promise<IngestionJob> {
  return ingestionJSON(`/jobs/${encodeURIComponent(jobId)}`);
}

export function listIngestionJobs(
  params: ListIngestionJobsParams = {},
): Promise<IngestionJob[]> {
  const search = new URLSearchParams();
  if (params.kind) search.set('kind', params.kind);
  if (params.status) search.set('status', params.status);
  if (params.document_id) search.set('document_id', params.document_id);
  if (params.chunk_id) search.set('chunk_id', params.chunk_id);
  if (params.session_id) search.set('session_id', params.session_id);
  const query = search.toString();
  return ingestionJSON(`/jobs${query ? `?${query}` : ''}`);
}

export function uploadIngestionDocuments(
  files: File[],
  { sourceName = '', parse = true }: UploadIngestionDocumentsOptions = {},
): Promise<WorkflowUploadResult[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  form.append('source_name', sourceName);
  form.append('parse', parse ? 'true' : 'false');
  return ingestionJSON('/workflow/documents', { method: 'POST', body: form });
}

export function getLatestParseJobsByDocument(
  jobs: IngestionJob[],
): Map<string, IngestionJob> {
  const byDocument = new Map<string, IngestionJob>();
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  for (const job of sorted) {
    if (!job.document_id || byDocument.has(job.document_id)) continue;
    byDocument.set(job.document_id, job);
  }
  return byDocument;
}

export function isParseJobActive(job: IngestionJob | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

export async function fetchChunkCountForDocument(documentId: string): Promise<number> {
  const pipeline = await getIngestionDocumentPipeline(documentId);
  return pipeline.totals.chunks ?? pipeline.chunks.length;
}

export function getChunkContent(chunkId: string): Promise<ChunkTableContent> {
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/content`);
}

export function putChunkContent(
  chunkId: string,
  body: ChunkContentPutBody,
): Promise<IngestionChunkLifecycle> {
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/content`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function commitIngestionChunk(
  chunkId: string,
  extractFacts?: boolean,
): Promise<CommitChunkResult> {
  const params = extractFacts === undefined ? '' : `?extract_facts=${extractFacts}`;
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/commit${params}`, {
    method: 'POST',
  });
}

export function commitIngestionDocumentChunks(
  documentId: string,
  extractFacts?: boolean,
): Promise<CommitChunkResult[]> {
  const params = extractFacts === undefined ? '' : `?extract_facts=${extractFacts}`;
  return ingestionJSON(
    `/documents/${encodeURIComponent(documentId)}/chunks/commit${params}`,
    { method: 'POST' },
  );
}

export function uncommitIngestionChunk(
  chunkId: string,
  force = false,
): Promise<IngestionChunkLifecycle> {
  const params = force ? '?force=true' : '';
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/uncommit${params}`, {
    method: 'POST',
  });
}

// --- Fact sessions (stage 2) ------------------------------------------------

export interface FactCardDraft {
  fact_id: string;
  fact_kind: string;
  claim: string;
  sme_lens: string;
  design_relevance: string;
  design_action?: string;
  reasoning?: string;
  confidence: number;
  review_status: string;
  evidence?: Record<string, unknown>[];
  edit_reason?: string | null;
}

export interface FactBatch {
  batch_id: string;
  source_name: string;
  status: string;
  review_round: number;
  revision: number;
  facts: FactCardDraft[];
  extraction_context?: Record<string, unknown>;
}

export interface FactSessionDetail {
  session: IngestionAgentSession;
  review_status: string | null;
  review_round: number;
  current_batch: FactBatch | null;
  reviewed_facts: FactCardDraft[];
  pending_review: {
    payload: {
      batch: FactBatch;
      facts?: FactCardDraft[];
      allowed_actions?: string[];
    };
  } | null;
}

export interface FactSessionMessage {
  author: string;
  text?: string;
  tool_calls: string[];
}

export interface FactSessionTurn {
  session: IngestionAgentSession;
  agent_message?: string;
  awaiting_review: boolean;
  review: FactSessionDetail['pending_review'];
}

export interface FactReviewBody {
  confirmed: boolean;
  batch?: FactBatch;
}

export interface FactCommitResult {
  session: IngestionAgentSession;
  facts: IngestionFactCard[];
  ner_session_id: string | null;
  ner_draft_job_id: string | null;
}

export interface IngestionFactCard {
  id: string;
  chunk_id: string;
  document_id: string;
  fact_kind: string;
  claim: string;
  sme_lens: string;
  design_relevance: string;
  design_action: string;
  reasoning: string;
  confidence: number;
  review_status: string;
  evidence: Record<string, unknown>[];
  edit_reason: string | null;
  source_name: string;
  batch_status: string;
  batch_revision: number;
  extraction_context: Record<string, unknown>;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export function getFactSession(sessionId: string): Promise<FactSessionDetail> {
  return ingestionJSON(`/fact-sessions/${encodeURIComponent(sessionId)}`);
}

export function getFactSessionMessages(sessionId: string): Promise<FactSessionMessage[]> {
  return ingestionJSON(`/fact-sessions/${encodeURIComponent(sessionId)}/messages`);
}

export function reviewFactSession(
  sessionId: string,
  body: FactReviewBody,
): Promise<FactSessionTurn> {
  return ingestionJSON(`/fact-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function chatFactSession(
  sessionId: string,
  message: string,
): Promise<FactSessionTurn> {
  return ingestionJSON(`/fact-sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function commitFactSession(
  sessionId: string,
  startNer?: boolean,
): Promise<FactCommitResult> {
  const params = startNer === undefined ? '' : `?start_ner=${startNer}`;
  return ingestionJSON(`/fact-sessions/${encodeURIComponent(sessionId)}/commit${params}`, {
    method: 'POST',
  });
}

export function startFactSession(
  chunkId: string,
  body: { extraction_context?: string; focus?: string[] } = {},
): Promise<FactSessionTurn> {
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/fact-sessions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listChunkFactCards(chunkId: string): Promise<IngestionFactCard[]> {
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/fact-cards`);
}

// --- NER sessions (stage 3) -------------------------------------------------

export type NerStage = 'candidate' | 'cluster' | 'mapping';

export interface NerMentionRef {
  mention_id?: string;
  entity_kind?: string;
  raw_text?: string;
  normalized_text?: string;
  source_ref?: string;
  source_field?: string;
  [key: string]: unknown;
}

export interface NerCandidateCard {
  candidate_id: string;
  candidate_type: string;
  raw_text: string;
  normalized_text: string;
  canonical_name: string;
  aliases: string[];
  mentions: NerMentionRef[];
  source_field?: string;
  source_ref?: string;
  context_snippet?: string;
  evidence?: string;
  metric_kind?: string;
  confidence: number;
  rationale?: string;
  review_status: string;
}

export interface NerCandidateBatch {
  candidate_batch_id?: string;
  source_type: string;
  source_id: string;
  status: string;
  revision: number;
  review_round: number;
  term_candidates: NerCandidateCard[];
  metric_candidates: NerCandidateCard[];
  uncertain_candidates?: NerCandidateCard[];
}

export interface NerClusterCard {
  cluster_id: string;
  cluster_type: string;
  canonical_name: string;
  aliases: string[];
  candidate_ids: string[];
  mentions: NerMentionRef[];
  decision: string;
  metric_kind?: string;
  confidence: number;
  rationale?: string;
  review_status: string;
}

export interface NerClusterBatch {
  cluster_batch_id: string;
  source_type: string;
  source_id: string;
  status: string;
  revision: number;
  review_round: number;
  clusters: NerClusterCard[];
  input_candidates?: NerCandidateCard[];
}

export interface NerMappingEntity {
  entity_id: string;
  entity_type: string;
  raw_text: string;
  normalized_text: string;
  source_field?: string;
  source_ref?: string;
  context_snippet?: string;
  evidence?: string;
  confidence: number;
}

export interface NerBucketMapping {
  mapping_id: string;
  entity_id: string;
  decision: string;
  bucket_id: string;
  bucket_type: string;
  bucket_canonical_name: string;
  bucket_labels: string[];
  metric_kind?: string;
  confidence: number;
  rationale?: string;
  review_status: string;
}

export interface NerMappingBatch {
  batch_id: string;
  source_type: string;
  source_id: string;
  status: string;
  revision: number;
  review_round: number;
  entities: NerMappingEntity[];
  bucket_mappings: NerBucketMapping[];
  proposed_bucket_changes?: Record<string, unknown>[];
  mapping_context?: Record<string, unknown>;
}

export type NerStageBatch = NerCandidateBatch | NerClusterBatch | NerMappingBatch;

export interface NerSessionDetail {
  session: IngestionAgentSession;
  stage: NerStage;
  stage_batch: NerStageBatch | null;
  approved_candidates: NerCandidateCard[];
  approved_clusters: NerClusterCard[];
  persistence_result: Record<string, unknown> | null;
  pending_review: {
    payload: {
      batch: NerStageBatch;
      allowed_actions?: string[];
    };
  } | null;
}

export interface NerSessionTurn {
  session: IngestionAgentSession;
  agent_message?: string;
  awaiting_review: boolean;
  review: NerSessionDetail['pending_review'];
}

export interface NerReviewBody {
  confirmed: boolean;
  batch?: NerStageBatch;
}

export interface NerPersistResult {
  session: IngestionAgentSession;
  persistence: Record<string, unknown>;
  mention_links: CatalogMention[];
}

export interface CatalogMention {
  link_id?: string;
  mention_id: string;
  session_id?: string;
  entity_kind: string;
  raw_text: string;
  normalized_text: string;
  bucket_label: string | null;
  bucket_id: string | null;
  decision: string | null;
  fact_id: string | null;
  chunk_id: string | null;
  document_id: string | null;
  source_ref?: string | null;
}

export function getNerSession(sessionId: string): Promise<NerSessionDetail> {
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}`);
}

export function getNerSessionMessages(sessionId: string): Promise<FactSessionMessage[]> {
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}/messages`);
}

export function reviewNerSession(
  sessionId: string,
  body: NerReviewBody,
  autoAdvance = true,
): Promise<NerSessionTurn> {
  const params = autoAdvance ? '' : '?auto_advance=false';
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}/review${params}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function chatNerSession(sessionId: string, message: string): Promise<NerSessionTurn> {
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function advanceNerSession(sessionId: string): Promise<NerSessionTurn> {
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}/advance`, {
    method: 'POST',
  });
}

export function persistNerSession(sessionId: string): Promise<NerPersistResult> {
  return ingestionJSON(`/ner-sessions/${encodeURIComponent(sessionId)}/persist`, {
    method: 'POST',
  });
}

export function startNerSession(
  chunkId: string,
  body: { fact_ids?: string[] } = {},
): Promise<NerSessionTurn> {
  return ingestionJSON(`/chunks/${encodeURIComponent(chunkId)}/ner-sessions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listCatalogMentions(params: {
  chunk_id?: string;
  document_id?: string;
  fact_id?: string;
  entity_kind?: string;
  q?: string;
} = {}): Promise<CatalogMention[]> {
  const search = new URLSearchParams();
  if (params.chunk_id) search.set('chunk_id', params.chunk_id);
  if (params.document_id) search.set('document_id', params.document_id);
  if (params.fact_id) search.set('fact_id', params.fact_id);
  if (params.entity_kind) search.set('entity_kind', params.entity_kind);
  if (params.q) search.set('q', params.q);
  const query = search.toString();
  return ingestionJSON(`/catalog/mentions${query ? `?${query}` : ''}`);
}

// --- Catalogue (stage 4) ----------------------------------------------------

export interface CatalogSummaryCounts {
  buckets: number;
  term_buckets: number;
  metric_buckets: number;
  labels: number;
  mentions: number;
  mappings: number;
  linked_mentions: number;
  linked_documents: number;
  linked_facts: number;
}

export interface CatalogSummary {
  counts: CatalogSummaryCounts;
  sources: Array<{
    source_id: string;
    mentions: number;
    metric_mentions: number;
    term_mentions: number;
    last_seen: string;
  }>;
}

export interface CatalogBucketLabel {
  label: string;
  label_type?: string;
  status?: string;
}

export interface CatalogBucket {
  id: string;
  bucket_kind: string;
  canonical_label: string;
  normalized_label: string;
  description: string | null;
  status: string;
  confidence: number | null;
  metric_kind: string | null;
  labels: CatalogBucketLabel[];
  mapping_count: number;
  approved_count: number;
  suggested_count: number;
  linked_mention_count: number;
  linked_fact_count: number;
  linked_chunk_count: number;
  linked_document_count: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogBucketLink {
  id?: string;
  link_id?: string;
  mention_id: string;
  session_id?: string;
  fact_id: string | null;
  chunk_id: string | null;
  document_id: string | null;
  raw_text: string;
  normalized_text?: string;
  entity_kind?: string;
  decision?: string | null;
  fact_claim?: string | null;
  document_filename?: string | null;
  chunk_type?: string | null;
}

export interface CatalogBucketDetail extends CatalogBucket {
  linked_mentions: CatalogBucketLink[];
  mappings?: Record<string, unknown>[];
}

export interface MentionTrace {
  link: Record<string, unknown>;
  mention: Record<string, unknown> | null;
  mapping: Record<string, unknown> | null;
  bucket: (Record<string, unknown> & { labels?: CatalogBucketLabel[] }) | null;
  fact: Record<string, unknown> | null;
  chunk: Record<string, unknown> | null;
  document: Record<string, unknown> | null;
}

export function getCatalogSummary(): Promise<CatalogSummary> {
  return ingestionJSON('/catalog/summary');
}

export function listCatalogBuckets(params: {
  kind?: string;
  status?: string;
  q?: string;
  document_id?: string;
} = {}): Promise<CatalogBucket[]> {
  const search = new URLSearchParams();
  if (params.kind) search.set('kind', params.kind);
  if (params.status) search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.document_id) search.set('document_id', params.document_id);
  const query = search.toString();
  return ingestionJSON(`/catalog/buckets${query ? `?${query}` : ''}`);
}

export function getCatalogBucket(bucketId: string): Promise<CatalogBucketDetail> {
  return ingestionJSON(`/catalog/buckets/${encodeURIComponent(bucketId)}`);
}

export function getMentionTrace(mentionId: string): Promise<MentionTrace> {
  return ingestionJSON(`/catalog/mentions/${encodeURIComponent(mentionId)}/trace`);
}
