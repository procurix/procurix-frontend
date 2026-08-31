import {
  advanceNerSession as liveAdvanceNerSession,
  chatFactSession as liveChatFactSession,
  chatNerSession as liveChatNerSession,
  commitFactSession as liveCommitFactSession,
  commitIngestionChunk as liveCommitChunk,
  commitIngestionDocumentChunks as liveCommitDocumentChunks,
  getFactSession as liveGetFactSession,
  getFactSessionMessages as liveGetFactSessionMessages,
  getNerSession as liveGetNerSession,
  getNerSessionMessages as liveGetNerSessionMessages,
  listCatalogMentions as liveListCatalogMentions,
  listChunkFactCards as liveListChunkFactCards,
  persistNerSession as livePersistNerSession,
  reviewFactSession as liveReviewFactSession,
  reviewNerSession as liveReviewNerSession,
  startFactSession as liveStartFactSession,
  startNerSession as liveStartNerSession,
  type CatalogMention,
  type CommitChunkResult,
  type FactCommitResult,
  type FactReviewBody,
  type FactSessionDetail,
  type FactSessionMessage,
  type FactSessionTurn,
  type IngestionFactCard,
  type NerPersistResult,
  type NerReviewBody,
  type NerSessionDetail,
  type NerSessionTurn,
} from '@/app/services/api/ingestion';
import {
  ensureMockFactSession,
  getMockFactSessionDetail,
  getMockFactSessionMessages,
  mockChatFactSession,
  mockCommitFactSession,
  mockListChunkFactCards,
  mockReviewFactSession,
} from '@/app/pages/ingestion/mock/mockFactClient';
import {
  ensureMockNerSession,
  getMockChunkMentions,
  getMockNerSessionDetail,
  getMockNerSessionMessages,
  mockAdvanceNerSession,
  mockChatNerSession,
  mockPersistNerSession,
  mockReviewNerSession,
} from '@/app/pages/ingestion/mock/mockNerClient';
import {
  captureFactSessionFixtures,
  captureNerSessionFixtures,
} from '@/app/pages/ingestion/mock/fixtureStore';
import { getIngestionDevMode, setIngestionDevMode, shouldSkipAgents } from '@/app/pages/ingestion/state/ingestionDevMode';
import { toast } from 'sonner';

async function maybeCaptureFact(sessionId: string, chunkId: string): Promise<void> {
  const { captureFixtures, mockMode } = getIngestionDevMode();
  if (!captureFixtures || mockMode) return;
  try {
    const [detail, messages, persistedFacts] = await Promise.all([
      liveGetFactSession(sessionId),
      liveGetFactSessionMessages(sessionId),
      liveListChunkFactCards(chunkId),
    ]);
    captureFactSessionFixtures(
      {
        detail,
        messages,
        persistedFacts,
        capturedAt: new Date().toISOString(),
        label: detail.session.chunk_id ?? sessionId,
      },
      captureFixtures,
    );
    toast.success('Captured fact session fixtures — click "Use captured fixtures" to replay in mock mode.');
  } catch {
    // Capture is best-effort during UI iteration.
  }
}

async function maybeCaptureNer(sessionId: string, chunkId: string): Promise<void> {
  const { captureFixtures, mockMode } = getIngestionDevMode();
  if (!captureFixtures || mockMode) return;
  try {
    const [detail, messages, mentionLinks] = await Promise.all([
      liveGetNerSession(sessionId),
      liveGetNerSessionMessages(sessionId),
      liveListCatalogMentions({ chunk_id: chunkId }),
    ]);
    captureNerSessionFixtures(
      {
        detail,
        messages,
        mentionLinks,
        capturedAt: new Date().toISOString(),
        label: detail.session.chunk_id ?? sessionId,
      },
      captureFixtures,
    );
    toast.success('Captured NER session fixtures — click "Use captured fixtures" to replay in mock mode.');
  } catch {
    // Capture is best-effort during UI iteration.
  }
}

async function finishCaptureIfNeeded(): Promise<void> {
  const { captureFixtures } = getIngestionDevMode();
  if (captureFixtures) {
    setIngestionDevMode({ captureFixtures: false });
  }
}

export function commitChunkWithDevMode(chunkId: string): Promise<CommitChunkResult> {
  const extractFacts = shouldSkipAgents() ? false : undefined;
  return liveCommitChunk(chunkId, extractFacts);
}

export function commitDocumentChunksWithDevMode(
  documentId: string,
): Promise<CommitChunkResult[]> {
  const extractFacts = shouldSkipAgents() ? false : undefined;
  return liveCommitDocumentChunks(documentId, extractFacts);
}

export async function fetchFactSessionDetail(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<FactSessionDetail> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return getMockFactSessionDetail(sessionId);
  }
  const detail = await liveGetFactSession(sessionId);
  await maybeCaptureFact(sessionId, chunkId);
  await finishCaptureIfNeeded();
  return detail;
}

export async function fetchFactSessionMessages(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<FactSessionMessage[]> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return getMockFactSessionMessages(sessionId);
  }
  return liveGetFactSessionMessages(sessionId);
}

export async function submitFactReview(
  sessionId: string,
  chunkId: string,
  documentId: string,
  body: FactReviewBody,
): Promise<FactSessionTurn> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return mockReviewFactSession(sessionId, body);
  }
  return liveReviewFactSession(sessionId, body);
}

export async function sendFactChatMessage(
  sessionId: string,
  chunkId: string,
  documentId: string,
  message: string,
): Promise<FactSessionTurn> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return mockChatFactSession(sessionId, message);
  }
  return liveChatFactSession(sessionId, message);
}

export async function commitFactsWithDevMode(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<FactCommitResult> {
  const { mockMode } = getIngestionDevMode();
  const startNer = shouldSkipAgents() ? false : undefined;
  if (mockMode) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return mockCommitFactSession(sessionId, startNer ?? false);
  }
  return liveCommitFactSession(sessionId, startNer);
}

export async function fetchChunkFactCards(
  chunkId: string,
  sessionId?: string,
  documentId?: string,
): Promise<IngestionFactCard[]> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode && sessionId && documentId) {
    ensureMockFactSession(chunkId, documentId, sessionId);
    return mockListChunkFactCards(sessionId);
  }
  return liveListChunkFactCards(chunkId);
}

export async function startLiveFactExtraction(chunkId: string): Promise<FactSessionTurn> {
  return liveStartFactSession(chunkId);
}

export function initMockFactSession(chunkId: string, documentId: string): string {
  return ensureMockFactSession(chunkId, documentId);
}

export async function fetchNerSessionDetail(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<NerSessionDetail> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return getMockNerSessionDetail(sessionId);
  }
  const detail = await liveGetNerSession(sessionId);
  await maybeCaptureNer(sessionId, chunkId);
  await finishCaptureIfNeeded();
  return detail;
}

export async function fetchNerSessionMessages(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<FactSessionMessage[]> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return getMockNerSessionMessages(sessionId);
  }
  return liveGetNerSessionMessages(sessionId);
}

export async function submitNerReview(
  sessionId: string,
  chunkId: string,
  documentId: string,
  body: NerReviewBody,
  autoAdvance = true,
): Promise<NerSessionTurn> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return mockReviewNerSession(sessionId, body);
  }
  return liveReviewNerSession(sessionId, body, autoAdvance);
}

export async function sendNerChatMessage(
  sessionId: string,
  chunkId: string,
  documentId: string,
  message: string,
): Promise<NerSessionTurn> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return mockChatNerSession(sessionId, message);
  }
  return liveChatNerSession(sessionId, message);
}

export async function advanceNerWithDevMode(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<NerSessionTurn> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return mockAdvanceNerSession(sessionId);
  }
  return liveAdvanceNerSession(sessionId);
}

export async function persistNerWithDevMode(
  sessionId: string,
  chunkId: string,
  documentId: string,
): Promise<NerPersistResult> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    return mockPersistNerSession(sessionId, chunkId, documentId);
  }
  return livePersistNerSession(sessionId);
}

export async function fetchChunkMentions(
  chunkId: string,
  sessionId?: string,
  documentId?: string,
): Promise<CatalogMention[]> {
  const { mockMode } = getIngestionDevMode();
  if (mockMode && sessionId && documentId) {
    ensureMockNerSession(chunkId, documentId, sessionId);
    const mockLinks = getMockChunkMentions(sessionId);
    if (mockLinks.length) return mockLinks;
  }
  return liveListCatalogMentions({ chunk_id: chunkId });
}

export async function startLiveNerExtraction(chunkId: string): Promise<NerSessionTurn> {
  return liveStartNerSession(chunkId);
}

export function initMockNerSession(chunkId: string, documentId: string): string {
  return ensureMockNerSession(chunkId, documentId);
}
