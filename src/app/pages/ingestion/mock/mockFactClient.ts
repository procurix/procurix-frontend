import type {
  FactReviewBody,
  FactSessionDetail,
  FactSessionMessage,
  FactSessionTurn,
  IngestionFactCard,
  FactCommitResult,
  FactBatch,
} from '@/app/services/api/ingestion';
import {
  buildDefaultFactSessionDetail,
  buildMockCommitResult,
  buildMockReviewTurn,
  DEFAULT_FACT_MESSAGES,
  type CapturedFactFixtures,
} from './defaultFactFixtures';
import { getMockChunkSessionId, loadCapturedFixtures, setMockChunkSession } from './fixtureStore';

interface MockSessionState {
  detail: FactSessionDetail;
  messages: FactSessionMessage[];
  persistedFacts: IngestionFactCard[];
  batch: FactBatch | null;
  reviewedFacts: FactSessionDetail['reviewed_facts'];
}

const mockSessions = new Map<string, MockSessionState>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getCapturedOrDefault(
  sessionId: string,
  chunkId: string,
  documentId: string,
): MockSessionState {
  const existing = mockSessions.get(sessionId);
  if (existing) return existing;

  const captured = loadCapturedFixtures();
  const detail =
    captured?.detail.session.id === sessionId
      ? clone(captured.detail)
      : buildDefaultFactSessionDetail(sessionId, chunkId, documentId);

  const messages =
    captured?.detail.session.id === sessionId
      ? clone(captured.messages)
      : clone(DEFAULT_FACT_MESSAGES);

  const state: MockSessionState = {
    detail,
    messages,
    persistedFacts: captured?.persistedFacts ? clone(captured.persistedFacts) : [],
    batch: detail.current_batch ? clone(detail.current_batch) : null,
    reviewedFacts: clone(detail.reviewed_facts),
  };
  mockSessions.set(sessionId, state);
  return state;
}

export function ensureMockFactSession(
  chunkId: string,
  documentId: string,
  sessionId?: string,
): string {
  const id = sessionId ?? getMockChunkSessionId(chunkId) ?? `mock-fact-${chunkId.slice(0, 8)}`;
  setMockChunkSession(chunkId, id);
  getCapturedOrDefault(id, chunkId, documentId);
  return id;
}

export function getMockFactSessionDetail(sessionId: string): FactSessionDetail {
  const state = mockSessions.get(sessionId);
  if (!state) {
    throw new Error(`Mock fact session ${sessionId} not initialized`);
  }
  return clone({
    ...state.detail,
    current_batch: state.batch,
    reviewed_facts: state.reviewedFacts,
    pending_review:
      state.detail.session.status === 'awaiting_review' && state.batch
        ? {
            payload: {
              batch: state.batch,
              facts: state.batch.facts,
              allowed_actions: ['approve', 'reject', 'edit', 'add'],
            },
          }
        : null,
  });
}

export function getMockFactSessionMessages(sessionId: string): FactSessionMessage[] {
  const state = mockSessions.get(sessionId);
  if (!state) throw new Error(`Mock fact session ${sessionId} not initialized`);
  return clone(state.messages);
}

export function mockReviewFactSession(
  sessionId: string,
  body: FactReviewBody,
): FactSessionTurn {
  const state = mockSessions.get(sessionId);
  if (!state || !state.batch) {
    throw new Error('Mock session has no batch to review');
  }
  const batch = body.batch ? clone(body.batch) : clone(state.batch);
  const turn = buildMockReviewTurn(state.detail, body.confirmed, batch);
  state.batch = turn.mockBatch;
  state.reviewedFacts = turn.mockReviewedFacts;
  state.detail = {
    ...state.detail,
    session: turn.session,
    current_batch: turn.mockBatch,
    reviewed_facts: turn.mockReviewedFacts,
    review_status: body.confirmed ? 'confirmed' : 'rejected',
    pending_review: null,
  };
  state.messages.push({
    author: 'user',
    text: body.confirmed ? 'Approved fact batch.' : 'Rejected fact batch.',
    tool_calls: [],
  });
  state.messages.push({
    author: 'agent',
    text: turn.agent_message ?? '',
    tool_calls: [],
  });
  const { mockBatch: _b, mockReviewedFacts: _r, ...publicTurn } = turn;
  return publicTurn;
}

export function mockChatFactSession(sessionId: string, message: string): FactSessionTurn {
  const state = mockSessions.get(sessionId);
  if (!state) throw new Error(`Mock fact session ${sessionId} not initialized`);
  if (state.detail.session.status === 'awaiting_review') {
    throw new Error(
      '409: this session has a review awaiting resolution - approve or reject first',
    );
  }
  state.messages.push({ author: 'user', text: message, tool_calls: [] });
  state.messages.push({
    author: 'agent',
    text: 'Mock agent: noted your correction. Re-opened review with the current batch.',
    tool_calls: ['update_fact_card'],
  });
  if (state.batch) {
    state.detail.session.status = 'awaiting_review';
    state.detail.pending_review = {
      payload: {
        batch: state.batch,
        facts: state.batch.facts,
        allowed_actions: ['approve', 'reject', 'edit', 'add'],
      },
    };
  }
  return {
    session: clone(state.detail.session),
    agent_message: 'Mock agent: noted your correction.',
    awaiting_review: true,
    review: state.detail.pending_review,
  };
}

export function mockCommitFactSession(
  sessionId: string,
  startNer: boolean,
): FactCommitResult {
  const state = mockSessions.get(sessionId);
  if (!state || !state.batch) {
    throw new Error('409: the current fact batch is absent or not confirmed');
  }
  if (state.batch.status !== 'confirmed') {
    throw new Error(
      `409: the current fact batch is '${state.batch.status}', not 'confirmed'`,
    );
  }
  const result = buildMockCommitResult(state.detail, state.batch, startNer);
  state.persistedFacts = clone(result.facts);
  state.detail.session = result.session;
  return clone(result);
}

export function mockListChunkFactCards(sessionId: string): IngestionFactCard[] {
  const state = mockSessions.get(sessionId);
  if (!state) return [];
  return clone(state.persistedFacts);
}

export function seedMockFromCapture(captured: CapturedFactFixtures): void {
  const sessionId = captured.detail.session.id;
  mockSessions.set(sessionId, {
    detail: clone(captured.detail),
    messages: clone(captured.messages),
    persistedFacts: clone(captured.persistedFacts ?? []),
    batch: captured.detail.current_batch ? clone(captured.detail.current_batch) : null,
    reviewedFacts: clone(captured.detail.reviewed_facts),
  });
  if (captured.detail.session.chunk_id) {
    setMockChunkSession(captured.detail.session.chunk_id, sessionId);
  }
}

export function resetMockSessions(): void {
  mockSessions.clear();
}
