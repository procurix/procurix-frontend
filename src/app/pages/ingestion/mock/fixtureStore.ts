import type { CapturedFactFixtures } from '@/app/pages/ingestion/mock/defaultFactFixtures';
import type { CapturedNerFixtures } from '@/app/pages/ingestion/mock/defaultNerFixtures';

const CAPTURED_KEY = 'ingestion:captured-fact-fixtures';
const CAPTURED_NER_KEY = 'ingestion:captured-ner-fixtures';
const MOCK_CHUNK_SESSION_KEY = 'ingestion:mock-chunk-sessions';

export const INGESTION_FIXTURES_CAPTURED_EVENT = 'ingestion:fixtures-captured';
export const INGESTION_NER_FIXTURES_CAPTURED_EVENT = 'ingestion:ner-fixtures-captured';

export function loadCapturedFixtures(): CapturedFactFixtures | null {
  try {
    const raw = localStorage.getItem(CAPTURED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CapturedFactFixtures;
  } catch {
    return null;
  }
}

export function saveCapturedFixtures(fixtures: CapturedFactFixtures): void {
  localStorage.setItem(CAPTURED_KEY, JSON.stringify(fixtures));
  window.dispatchEvent(new CustomEvent(INGESTION_FIXTURES_CAPTURED_EVENT));
}

export function clearCapturedFixtures(): void {
  localStorage.removeItem(CAPTURED_KEY);
}

export function exportCapturedFixtures(): string {
  const fixtures = loadCapturedFixtures();
  return JSON.stringify(fixtures, null, 2);
}

export function loadMockChunkSessionMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MOCK_CHUNK_SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function setMockChunkSession(chunkId: string, sessionId: string): void {
  const map = loadMockChunkSessionMap();
  map[chunkId] = sessionId;
  localStorage.setItem(MOCK_CHUNK_SESSION_KEY, JSON.stringify(map));
}

export function getMockChunkSessionId(chunkId: string): string | undefined {
  return loadMockChunkSessionMap()[chunkId];
}

export function captureFactSessionFixtures(
  fixtures: CapturedFactFixtures,
  enabled: boolean,
): void {
  if (!enabled) return;
  saveCapturedFixtures(fixtures);
}

export function loadCapturedNerFixtures(): CapturedNerFixtures | null {
  try {
    const raw = localStorage.getItem(CAPTURED_NER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CapturedNerFixtures;
  } catch {
    return null;
  }
}

export function saveCapturedNerFixtures(fixtures: CapturedNerFixtures): void {
  localStorage.setItem(CAPTURED_NER_KEY, JSON.stringify(fixtures));
  window.dispatchEvent(new CustomEvent(INGESTION_NER_FIXTURES_CAPTURED_EVENT));
}

export function clearCapturedNerFixtures(): void {
  localStorage.removeItem(CAPTURED_NER_KEY);
}

export function exportCapturedNerFixtures(): string {
  return JSON.stringify(loadCapturedNerFixtures(), null, 2);
}

export function captureNerSessionFixtures(
  fixtures: CapturedNerFixtures,
  enabled: boolean,
): void {
  if (!enabled) return;
  saveCapturedNerFixtures(fixtures);
}
