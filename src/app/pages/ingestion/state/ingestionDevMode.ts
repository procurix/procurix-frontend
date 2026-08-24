export interface IngestionDevMode {
  /** Skip Gemini on chunk/fact commit (extract_facts=false, start_ner=false). */
  designMode: boolean;
  /** Serve fact-session endpoints from fixtures instead of the live backend. */
  mockMode: boolean;
  /** While live, persist the next fact-session payloads to localStorage for mock replay. */
  captureFixtures: boolean;
}

const STORAGE_KEY = 'ingestion:dev-mode';

const envDesignMode = import.meta.env.VITE_INGESTION_DESIGN_MODE === 'true';

function readStored(): Partial<IngestionDevMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<IngestionDevMode>;
  } catch {
    return {};
  }
}

let devMode: IngestionDevMode = {
  designMode: envDesignMode,
  mockMode: false,
  captureFixtures: false,
  ...readStored(),
};

const listeners = new Set<() => void>();

export function getIngestionDevMode(): IngestionDevMode {
  return devMode;
}

export function setIngestionDevMode(patch: Partial<IngestionDevMode>): IngestionDevMode {
  devMode = { ...devMode, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devMode));
  listeners.forEach((listener) => listener());
  return devMode;
}

export function subscribeIngestionDevMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function shouldSkipAgents(): boolean {
  return devMode.designMode || devMode.mockMode;
}
