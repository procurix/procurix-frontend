import type {
  CatalogMention,
  FactSessionMessage,
  NerPersistResult,
  NerReviewBody,
  NerSessionDetail,
  NerSessionTurn,
  NerStageBatch,
} from '@/app/services/api/ingestion';
import {
  buildDefaultNerSessionDetail,
  buildMockNerPersistResult,
  buildMockNerReviewTurn,
  DEFAULT_NER_MESSAGES,
  type CapturedNerFixtures,
} from './defaultNerFixtures';
import {
  getMockChunkSessionId,
  loadCapturedNerFixtures,
  setMockChunkSession,
} from './fixtureStore';

interface MockNerSessionState {
  detail: NerSessionDetail;
  messages: FactSessionMessage[];
  mentionLinks: CatalogMention[];
}

const mockNerSessions = new Map<string, MockNerSessionState>();
const MOCK_NER_CHUNK_KEY = 'ner';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function chunkNerKey(chunkId: string): string {
  return `${MOCK_NER_CHUNK_KEY}:${chunkId}`;
}

function getCapturedOrDefault(
  sessionId: string,
  chunkId: string,
  documentId: string,
): MockNerSessionState {
  const existing = mockNerSessions.get(sessionId);
  if (existing) return existing;

  const captured = loadCapturedNerFixtures();
  const detail =
    captured?.detail.session.id === sessionId
      ? clone(captured.detail)
      : buildDefaultNerSessionDetail(sessionId, chunkId, documentId);

  const messages =
    captured?.detail.session.id === sessionId
      ? clone(captured.messages)
      : clone(DEFAULT_NER_MESSAGES);

  const state: MockNerSessionState = {
    detail,
    messages,
    mentionLinks: captured?.mentionLinks ? clone(captured.mentionLinks) : [],
  };
  mockNerSessions.set(sessionId, state);
  return state;
}

export function ensureMockNerSession(
  chunkId: string,
  documentId: string,
  sessionId?: string,
): string {
  const id =
    sessionId ??
    getMockChunkSessionId(chunkNerKey(chunkId)) ??
    `mock-ner-${chunkId.slice(0, 8)}`;
  setMockChunkSession(chunkNerKey(chunkId), id);
  getCapturedOrDefault(id, chunkId, documentId);
  return id;
}

export function getMockNerSessionDetail(sessionId: string): NerSessionDetail {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);
  return clone(state.detail);
}

export function getMockNerSessionMessages(sessionId: string): FactSessionMessage[] {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);
  return clone(state.messages);
}

export function getMockChunkMentions(sessionId: string): CatalogMention[] {
  const state = mockNerSessions.get(sessionId);
  if (!state) return [];
  return clone(state.mentionLinks);
}

export function mockReviewNerSession(
  sessionId: string,
  body: NerReviewBody,
): NerSessionTurn {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);

  const batch = body.batch
    ? clone(body.batch)
    : state.detail.pending_review?.payload.batch ?? state.detail.stage_batch;
  const turn = buildMockNerReviewTurn(state.detail, body.confirmed, batch as NerStageBatch);

  state.detail = {
    ...state.detail,
    ...turn.nextDetail,
    session: turn.session,
  };
  state.messages.push({
    author: 'user',
    text: body.confirmed ? `Approved ${state.detail.stage} batch.` : 'Rejected batch.',
    tool_calls: [],
  });
  state.messages.push({
    author: 'agent',
    text: turn.agent_message ?? '',
    tool_calls: [],
  });

  const { nextDetail: _n, ...publicTurn } = turn;
  return publicTurn;
}

export function mockChatNerSession(sessionId: string, message: string): NerSessionTurn {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);
  if (state.detail.session.status === 'awaiting_review') {
    throw new Error(
      '409: this session has a review awaiting resolution - approve or reject first',
    );
  }

  state.messages.push({ author: 'user', text: message, tool_calls: [] });
  state.messages.push({
    author: 'agent',
    text: 'Mock agent: noted your correction and re-opened review.',
    tool_calls: ['update_batch'],
  });

  if (state.detail.stage_batch) {
    state.detail.session.status = 'awaiting_review';
    state.detail.pending_review = {
      payload: { batch: state.detail.stage_batch },
    };
  }

  return {
    session: clone(state.detail.session),
    agent_message: 'Mock agent: noted your correction.',
    awaiting_review: true,
    review: state.detail.pending_review,
  };
}

export function mockAdvanceNerSession(sessionId: string): NerSessionTurn {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);
  if (state.detail.session.status !== 'reviewed') {
    throw new Error('409: the active stage review must be confirmed before advancing');
  }
  return {
    session: clone(state.detail.session),
    awaiting_review: false,
    review: null,
  };
}

export function mockPersistNerSession(
  sessionId: string,
  chunkId: string,
  documentId: string,
): NerPersistResult {
  const state = mockNerSessions.get(sessionId);
  if (!state) throw new Error(`Mock NER session ${sessionId} not initialized`);
  if (state.detail.session.status !== 'reviewed' || state.detail.stage !== 'mapping') {
    throw new Error('409: persist requires the mapping stage review to be confirmed first');
  }

  const result = buildMockNerPersistResult(state.detail, chunkId, documentId);
  state.mentionLinks = clone(result.mention_links);
  state.detail.session = result.session;
  state.detail.persistence_result = result.persistence;
  state.messages.push({
    author: 'agent',
    text: `Persisted ${result.mention_links.length} mention link(s) (mock — no live ner schema write).`,
    tool_calls: ['persist'],
  });
  return clone(result);
}

export function seedMockNerFromCapture(captured: CapturedNerFixtures): void {
  const sessionId = captured.detail.session.id;
  mockNerSessions.set(sessionId, {
    detail: clone(captured.detail),
    messages: clone(captured.messages),
    mentionLinks: clone(captured.mentionLinks ?? []),
  });
  if (captured.detail.session.chunk_id) {
    setMockChunkSession(chunkNerKey(captured.detail.session.chunk_id), sessionId);
  }
}
