import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  getIngestionDevMode,
  setIngestionDevMode,
  subscribeIngestionDevMode,
  type IngestionDevMode,
} from './ingestionDevMode';
import {
  clearCapturedFixtures,
  clearCapturedNerFixtures,
  exportCapturedFixtures,
  exportCapturedNerFixtures,
  INGESTION_FIXTURES_CAPTURED_EVENT,
  INGESTION_NER_FIXTURES_CAPTURED_EVENT,
  loadCapturedFixtures,
  loadCapturedNerFixtures,
} from '@/app/pages/ingestion/mock/fixtureStore';
import type { CapturedFactFixtures } from '@/app/pages/ingestion/mock/defaultFactFixtures';
import type { CapturedNerFixtures } from '@/app/pages/ingestion/mock/defaultNerFixtures';
import { seedMockFromCapture } from '@/app/pages/ingestion/mock/mockFactClient';
import { seedMockNerFromCapture } from '@/app/pages/ingestion/mock/mockNerClient';

interface IngestionDevContextValue extends IngestionDevMode {
  capturedFixtures: CapturedFactFixtures | null;
  capturedNerFixtures: CapturedNerFixtures | null;
  setDesignMode: (enabled: boolean) => void;
  setMockMode: (enabled: boolean) => void;
  setCaptureFixtures: (enabled: boolean) => void;
  clearFixtures: () => void;
  downloadFixtures: () => void;
  applyCapturedToMock: () => void;
}

const IngestionDevContext = createContext<IngestionDevContextValue | null>(null);

export function IngestionDevProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<IngestionDevMode>(() => getIngestionDevMode());
  const [capturedFixtures, setCapturedFixturesState] = useState<CapturedFactFixtures | null>(
    () => loadCapturedFixtures(),
  );
  const [capturedNerFixtures, setCapturedNerFixturesState] = useState<CapturedNerFixtures | null>(
    () => loadCapturedNerFixtures(),
  );

  useEffect(() => subscribeIngestionDevMode(() => setMode(getIngestionDevMode())), []);

  const refreshCaptured = () => {
    setCapturedFixturesState(loadCapturedFixtures());
    setCapturedNerFixturesState(loadCapturedNerFixtures());
  };

  useEffect(() => {
    const onCaptured = () => refreshCaptured();
    window.addEventListener(INGESTION_FIXTURES_CAPTURED_EVENT, onCaptured);
    window.addEventListener(INGESTION_NER_FIXTURES_CAPTURED_EVENT, onCaptured);
    return () => {
      window.removeEventListener(INGESTION_FIXTURES_CAPTURED_EVENT, onCaptured);
      window.removeEventListener(INGESTION_NER_FIXTURES_CAPTURED_EVENT, onCaptured);
    };
  }, []);

  const value: IngestionDevContextValue = {
    ...mode,
    capturedFixtures,
    capturedNerFixtures,
    setDesignMode: (enabled) => setIngestionDevMode({ designMode: enabled }),
    setMockMode: (enabled) => {
      setIngestionDevMode({ mockMode: enabled });
      if (enabled) {
        toast.message('Mock mode on — fact and NER sessions use fixtures, no Gemini.');
      }
    },
    setCaptureFixtures: (enabled) => {
      setIngestionDevMode({ captureFixtures: enabled });
      if (enabled) {
        toast.message(
          'Capture on — next live fact or NER session will be saved, then capture turns off.',
        );
      }
    },
    clearFixtures: () => {
      clearCapturedFixtures();
      clearCapturedNerFixtures();
      refreshCaptured();
      toast.success('Captured fixtures cleared');
    },
    downloadFixtures: () => {
      const facts = exportCapturedFixtures();
      const ner = exportCapturedNerFixtures();
      if ((!facts || facts === 'null') && (!ner || ner === 'null')) {
        toast.error('Nothing captured yet — run a live session with capture enabled.');
        return;
      }
      const payload = {
        facts: facts && facts !== 'null' ? JSON.parse(facts) : null,
        ner: ner && ner !== 'null' ? JSON.parse(ner) : null,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ingestion-fixtures.json';
      anchor.click();
      URL.revokeObjectURL(url);
    },
    applyCapturedToMock: () => {
      const capturedFacts = loadCapturedFixtures();
      const capturedNer = loadCapturedNerFixtures();
      if (!capturedFacts && !capturedNer) {
        toast.error('No captured fixtures — enable capture and run a live session first.');
        return;
      }
      if (capturedFacts) seedMockFromCapture(capturedFacts);
      if (capturedNer) seedMockNerFromCapture(capturedNer);
      setIngestionDevMode({ mockMode: true });
      toast.success('Loaded captured fixtures into mock mode');
    },
  };

  return (
    <IngestionDevContext.Provider value={value}>{children}</IngestionDevContext.Provider>
  );
}

export function useIngestionDev(): IngestionDevContextValue {
  const ctx = useContext(IngestionDevContext);
  if (!ctx) {
    throw new Error('useIngestionDev must be used within IngestionDevProvider');
  }
  return ctx;
}
