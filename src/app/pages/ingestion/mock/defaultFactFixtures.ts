import type {
  FactBatch,
  FactCommitResult,
  FactSessionDetail,
  FactSessionMessage,
  FactSessionTurn,
  IngestionFactCard,
} from '@/app/services/api/ingestion';

const now = () => new Date().toISOString();

function makeSession(
  sessionId: string,
  chunkId: string,
  documentId: string,
  status: string,
): FactSessionDetail['session'] {
  return {
    id: sessionId,
    kind: 'fact',
    scope_type: 'chunk',
    chunk_id: chunkId,
    document_id: documentId,
    stage: 'fact',
    status,
    pending_invocation_id: status === 'awaiting_review' ? 'mock-inv-1' : null,
    pending_calls:
      status === 'awaiting_review'
        ? [{ id: 'call-1', name: 'review_current_fact_batch' }]
        : [],
    last_error: null,
    extra: {},
    created_at: now(),
    updated_at: now(),
    version: 1,
  };
}

export function buildDefaultFactBatch(chunkId: string): FactBatch {
  return {
    batch_id: 'fact-batch-mock-001',
    source_name: 'mock-fixture',
    status: 'draft',
    review_round: 1,
    revision: 0,
    extraction_context: {},
    facts: [
      {
        fact_id: 'fact-mock-001',
        fact_kind: 'explicit',
        claim: 'Supplier TI is the awarded source for PN-100.',
        sme_lens: 'sourcing',
        design_relevance: 'supplier_selection',
        design_action: '',
        reasoning: 'Mock fixture — replace by capturing a live run.',
        confidence: 0.92,
        review_status: 'pending',
        evidence: [
          {
            evidence_type: 'artifact',
            text: 'Award Supplier: TI',
            source_ref: `chunk:${chunkId}:row:1`,
          },
        ],
      },
      {
        fact_id: 'fact-mock-002',
        fact_kind: 'explicit',
        claim: 'OTIF % target for the award is 95.',
        sme_lens: 'sourcing',
        design_relevance: 'performance',
        design_action: '',
        reasoning: 'Mock fixture — replace by capturing a live run.',
        confidence: 0.88,
        review_status: 'pending',
        evidence: [
          {
            evidence_type: 'artifact',
            text: 'OTIF %: 95',
            source_ref: `chunk:${chunkId}:row:1`,
          },
        ],
      },
    ],
  };
}

export function buildDefaultFactSessionDetail(
  sessionId: string,
  chunkId: string,
  documentId: string,
): FactSessionDetail {
  const batch = buildDefaultFactBatch(chunkId);
  return {
    session: makeSession(sessionId, chunkId, documentId, 'awaiting_review'),
    review_status: 'awaiting_human_review',
    review_round: 1,
    current_batch: batch,
    reviewed_facts: [],
    pending_review: {
      payload: {
        batch,
        facts: batch.facts,
        allowed_actions: ['approve', 'reject', 'edit', 'add'],
      },
    },
  };
}

export const DEFAULT_FACT_MESSAGES: FactSessionMessage[] = [
  {
    author: 'agent',
    text: 'Drafted 2 facts from the committed table. Please review the batch below.',
    tool_calls: ['create_fact_review_batch'],
  },
];

export function buildMockPersistedFacts(
  chunkId: string,
  documentId: string,
  batch: FactBatch,
): IngestionFactCard[] {
  const approved = batch.facts.filter((fact) => fact.review_status !== 'rejected');
  return approved.map((fact, index) => ({
    id: `persisted-mock-${index + 1}`,
    chunk_id: chunkId,
    document_id: documentId,
    fact_kind: fact.fact_kind,
    claim: fact.claim,
    sme_lens: fact.sme_lens,
    design_relevance: fact.design_relevance,
    design_action: fact.design_action ?? '',
    reasoning: fact.reasoning ?? '',
    confidence: fact.confidence,
    review_status: fact.review_status,
    evidence: fact.evidence ?? [],
    edit_reason: null,
    source_name: batch.source_name,
    batch_status: 'confirmed',
    batch_revision: batch.revision,
    extraction_context: batch.extraction_context ?? {},
    embedding_model: null,
    created_at: now(),
    updated_at: now(),
    version: 1,
  }));
}

export interface CapturedFactFixtures {
  detail: FactSessionDetail;
  messages: FactSessionMessage[];
  persistedFacts?: IngestionFactCard[];
  capturedAt: string;
  label?: string;
}

export interface MockReviewResult extends FactSessionTurn {
  mockBatch: FactBatch;
  mockReviewedFacts: FactBatch['facts'];
}

export function buildMockReviewTurn(
  detail: FactSessionDetail,
  confirmed: boolean,
  batch: FactBatch,
): MockReviewResult {
  const facts = batch.facts.map((fact) => ({
    ...fact,
    review_status: confirmed
      ? fact.review_status === 'rejected'
        ? 'rejected'
        : 'approved'
      : 'rejected',
  }));
  const nextBatch: FactBatch = {
    ...batch,
    facts,
    status: confirmed ? 'confirmed' : 'rejected',
    revision: batch.revision + 1,
  };
  return {
    session: {
      ...detail.session,
      status: confirmed ? 'reviewed' : 'rejected',
      pending_invocation_id: null,
      pending_calls: [],
      updated_at: now(),
    },
    agent_message: confirmed ? 'Batch approved.' : 'Batch rejected.',
    awaiting_review: false,
    review: null,
    mockBatch: nextBatch,
    mockReviewedFacts: facts,
  };
}

export function buildMockCommitResult(
  detail: FactSessionDetail,
  batch: FactBatch,
  startNer: boolean,
): FactCommitResult {
  const facts = buildMockPersistedFacts(
    detail.session.chunk_id!,
    detail.session.document_id,
    batch,
  );
  return {
    session: {
      ...detail.session,
      status: 'committed',
      updated_at: now(),
    },
    facts,
    ner_session_id: startNer ? 'mock-ner-session-001' : null,
    ner_draft_job_id: startNer ? 'mock-ner-job-001' : null,
  };
}
