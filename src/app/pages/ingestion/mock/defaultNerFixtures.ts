import type {
  CatalogMention,
  FactSessionMessage,
  NerCandidateBatch,
  NerCandidateCard,
  NerClusterBatch,
  NerClusterCard,
  NerMappingBatch,
  NerPersistResult,
  NerSessionDetail,
  NerSessionTurn,
  NerStage,
} from '@/app/services/api/ingestion';
import { isNerItemKept, normalizeNerItemForApproval } from '../components/nerReviewUtils';

const now = () => new Date().toISOString();

function makeNerSession(
  sessionId: string,
  chunkId: string,
  documentId: string,
  stage: NerStage,
  status: string,
): NerSessionDetail['session'] {
  return {
    id: sessionId,
    kind: 'ner',
    scope_type: 'chunk',
    chunk_id: chunkId,
    document_id: documentId,
    stage,
    status,
    pending_invocation_id: status === 'awaiting_review' ? 'mock-ner-inv-1' : null,
    pending_calls:
      status === 'awaiting_review'
        ? [{ id: 'call-1', name: `review_current_${stage}_batch` }]
        : [],
    last_error: null,
    extra: {},
    created_at: now(),
    updated_at: now(),
    version: 1,
  };
}

function mention(raw: string, normalized: string, factRef: string): NerCandidateCard['mentions'][0] {
  return {
    mention_id: `mention-${raw.replace(/\W+/g, '-').toLowerCase()}`,
    entity_kind: 'term',
    raw_text: raw,
    normalized_text: normalized,
    source_ref: factRef,
    source_field: 'claim',
  };
}

export function buildDefaultCandidateBatch(chunkId: string): NerCandidateBatch {
  const factRef = `fact:persisted-mock-1`;
  return {
    candidate_batch_id: 'candidate-batch-mock-001',
    source_type: 'fact_batch',
    source_id: 'mock-fixture',
    status: 'draft',
    revision: 0,
    review_round: 1,
    term_candidates: [
      {
        candidate_id: 'cand-term-mock-001',
        candidate_type: 'term',
        raw_text: 'TI',
        normalized_text: 'Texas Instruments',
        canonical_name: 'Texas Instruments',
        aliases: ['TI'],
        mentions: [mention('TI', 'Texas Instruments', factRef)],
        source_field: 'claim',
        source_ref: factRef,
        confidence: 0.9,
        rationale: 'Mock fixture — supplier name from fact card.',
        review_status: 'pending',
      },
    ],
    metric_candidates: [
      {
        candidate_id: 'cand-metric-mock-001',
        candidate_type: 'metric',
        raw_text: 'OTIF %',
        normalized_text: 'otif percent',
        canonical_name: 'OTIF',
        aliases: ['OTIF %'],
        mentions: [mention('OTIF %', 'otif percent', `fact:persisted-mock-2`)],
        source_field: 'claim',
        source_ref: `fact:persisted-mock-2`,
        metric_kind: 'numeric_measure',
        confidence: 0.85,
        rationale: 'Mock fixture — delivery metric from fact card.',
        review_status: 'pending',
      },
    ],
    uncertain_candidates: [],
  };
}

export function buildClusterBatchFromCandidates(candidates: NerCandidateCard[]): NerClusterBatch {
  const clusters: NerClusterCard[] = candidates.map((card, index) => ({
    cluster_id: `cluster-mock-${index + 1}`,
    cluster_type: card.candidate_type,
    canonical_name: card.canonical_name || card.normalized_text,
    aliases: card.aliases,
    candidate_ids: [card.candidate_id],
    mentions: card.mentions,
    decision: 'keep',
    metric_kind: card.metric_kind ?? '',
    confidence: card.confidence,
    rationale: 'Mock cluster from approved candidate.',
    review_status: 'pending',
  }));
  return {
    cluster_batch_id: 'cluster-batch-mock-001',
    source_type: 'fact_batch',
    source_id: 'mock-fixture',
    status: 'draft',
    revision: 0,
    review_round: 1,
    clusters,
    input_candidates: candidates,
  };
}

export function buildMappingBatchFromClusters(clusters: NerClusterCard[]): NerMappingBatch {
  const entities = clusters.map((cluster, index) => {
    const ref = cluster.mentions[0];
    return {
      entity_id: `ent-mock-${index + 1}`,
      entity_type: cluster.cluster_type,
      raw_text: ref?.raw_text ?? cluster.canonical_name,
      normalized_text: ref?.normalized_text ?? cluster.canonical_name,
      source_ref: ref?.source_ref ?? 'chat:user',
      confidence: cluster.confidence,
    };
  });
  const bucket_mappings = clusters.map((cluster, index) => ({
    mapping_id: `map-mock-${index + 1}`,
    entity_id: entities[index].entity_id,
    decision: 'create_bucket',
    bucket_id: '',
    bucket_type: cluster.cluster_type,
    bucket_canonical_name: cluster.canonical_name,
    bucket_labels: cluster.aliases,
    metric_kind: cluster.metric_kind ?? '',
    confidence: cluster.confidence,
    rationale: 'Mock mapping — create new bucket.',
    review_status: 'pending',
  }));
  return {
    batch_id: 'ner-batch-mock-001',
    source_type: 'fact_batch',
    source_id: 'mock-fixture',
    status: 'draft',
    revision: 0,
    review_round: 1,
    entities,
    bucket_mappings,
    proposed_bucket_changes: [],
    mapping_context: {},
  };
}

export function buildDefaultNerSessionDetail(
  sessionId: string,
  chunkId: string,
  documentId: string,
): NerSessionDetail {
  const batch = buildDefaultCandidateBatch(chunkId);
  return {
    session: makeNerSession(sessionId, chunkId, documentId, 'candidate', 'awaiting_review'),
    stage: 'candidate',
    stage_batch: batch,
    approved_candidates: [],
    approved_clusters: [],
    persistence_result: null,
    pending_review: {
      payload: {
        batch,
        allowed_actions: ['approve', 'reject', 'edit'],
      },
    },
  };
}

export const DEFAULT_NER_MESSAGES: FactSessionMessage[] = [
  {
    author: 'agent',
    text: 'Extracted term and metric candidates from persisted facts. Review the batch below.',
    tool_calls: ['create_candidate_batch'],
  },
];

export interface CapturedNerFixtures {
  detail: NerSessionDetail;
  messages: FactSessionMessage[];
  mentionLinks?: CatalogMention[];
  capturedAt: string;
  label?: string;
}

export function buildMockNerReviewTurn(
  detail: NerSessionDetail,
  confirmed: boolean,
  batch: NerSessionDetail['stage_batch'],
): NerSessionTurn & { nextDetail: Partial<NerSessionDetail> } {
  const stage = detail.stage;
  if (!batch) {
    throw new Error('No batch to review');
  }

  if (!confirmed) {
    return {
      session: { ...detail.session, status: 'rejected', pending_calls: [], updated_at: now() },
      agent_message: 'Stage rejected.',
      awaiting_review: false,
      review: null,
      nextDetail: {
        session: { ...detail.session, status: 'rejected', pending_calls: [], updated_at: now() },
        pending_review: null,
      },
    };
  }

  if (stage === 'candidate') {
    const candidateBatch = batch as NerCandidateBatch;
    const approved = [
      ...candidateBatch.term_candidates,
      ...candidateBatch.metric_candidates,
      ...(candidateBatch.uncertain_candidates ?? []),
    ]
      .filter(isNerItemKept)
      .map((c) => normalizeNerItemForApproval({ ...c, review_status: c.review_status }));
    const clusterBatch = buildClusterBatchFromCandidates(approved);
    return {
      session: makeNerSession(
        detail.session.id,
        detail.session.chunk_id!,
        detail.session.document_id,
        'cluster',
        'awaiting_review',
      ),
      agent_message: 'Candidates approved — cluster batch ready for review.',
      awaiting_review: true,
      review: { payload: { batch: clusterBatch } },
      nextDetail: {
        stage: 'cluster',
        stage_batch: clusterBatch,
        approved_candidates: approved,
        approved_clusters: [],
        pending_review: { payload: { batch: clusterBatch } },
      },
    };
  }

  if (stage === 'cluster') {
    const clusterBatch = batch as NerClusterBatch;
    const approved = clusterBatch.clusters
      .filter(isNerItemKept)
      .map((c) => normalizeNerItemForApproval({ ...c, review_status: c.review_status }));
    const mappingBatch = buildMappingBatchFromClusters(approved);
    return {
      session: makeNerSession(
        detail.session.id,
        detail.session.chunk_id!,
        detail.session.document_id,
        'mapping',
        'awaiting_review',
      ),
      agent_message: 'Clusters approved — bucket mapping batch ready for review.',
      awaiting_review: true,
      review: { payload: { batch: mappingBatch } },
      nextDetail: {
        stage: 'mapping',
        stage_batch: mappingBatch,
        approved_clusters: approved,
        pending_review: { payload: { batch: mappingBatch } },
      },
    };
  }

  const mappingBatch = batch as NerMappingBatch;
  const confirmedBatch = {
    ...mappingBatch,
    status: 'confirmed',
    bucket_mappings: mappingBatch.bucket_mappings
      .filter(isNerItemKept)
      .map((m) => normalizeNerItemForApproval({ ...m, review_status: m.review_status })),
  };
  return {
    session: makeNerSession(
      detail.session.id,
      detail.session.chunk_id!,
      detail.session.document_id,
      'mapping',
      'reviewed',
    ),
    agent_message: 'Mapping approved — ready to persist.',
    awaiting_review: false,
    review: null,
    nextDetail: {
      stage_batch: confirmedBatch,
      pending_review: null,
    },
  };
}

export function buildMockNerPersistResult(
  detail: NerSessionDetail,
  chunkId: string,
  documentId: string,
): NerPersistResult {
  const batch = detail.stage_batch as NerMappingBatch | null;
  const links: CatalogMention[] = (batch?.bucket_mappings ?? []).map((mapping, index) => {
    const entity = batch?.entities.find((e) => e.entity_id === mapping.entity_id);
    return {
      mention_id: `mention-persisted-mock-${index + 1}`,
      entity_kind: mapping.bucket_type,
      raw_text: entity?.raw_text ?? mapping.bucket_canonical_name,
      normalized_text: entity?.normalized_text ?? mapping.bucket_canonical_name,
      bucket_label: mapping.bucket_canonical_name,
      bucket_id: `bucket-mock-${index + 1}`,
      decision: mapping.decision,
      fact_id: entity?.source_ref?.startsWith('fact:')
        ? entity.source_ref.slice(5)
        : null,
      chunk_id: chunkId,
      document_id: documentId,
      source_ref: entity?.source_ref ?? null,
    };
  });
  return {
    session: makeNerSession(
      detail.session.id,
      chunkId,
      documentId,
      'mapping',
      'persisted',
    ),
    persistence: {
      skipped: true,
      counts: { mentions: links.length, buckets: links.length },
    },
    mention_links: links,
  };
}
