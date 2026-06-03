import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { UploadResponse } from '@/app/services/api';

interface SessionContextType {
  sessionId: string | null;
  setSessionId: (sessionId: string | null) => void;
  uploadData: UploadResponse | null;
  setUploadData: (data: UploadResponse | null) => void;
  currentStage: number | null;
  // Authoritative backend stage sync; may move backward when review blockers exist.
  setCurrentStage: (stage: number | null) => void;
  // Increments every time chat changes backend state — pages watch this to re-fetch
  refreshTrigger: number;
  triggerRefresh: () => void;
  // Optimistic local unlock from user/chat actions; never moves backward.
  pushStage: (stage: number) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const SESSION_KEY = 'procurix_session_id';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(
    () => localStorage.getItem(SESSION_KEY),
  );
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [currentStage, setCurrentStageState] = useState<number | null>(null);

  const setCurrentStage = useCallback((stage: number | null) => {
    if (stage === null) {
      setCurrentStageState(null);
      return;
    }
    setCurrentStageState(stage);
  }, []);

  const setSessionId = useCallback((id: string | null) => {
    setCurrentStageState(null);
    setUploadData(null);
    setSessionIdState(id);
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  }, []);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(n => n + 1);
  }, []);

  const pushStage = useCallback((stage: number) => {
    setCurrentStageState(prev => prev === null ? stage : Math.max(prev, stage));
  }, []);

  // Also listen for the global 'design:updated' event so any code can trigger a refresh
  useEffect(() => {
    const handler = () => triggerRefresh();
    window.addEventListener('design:updated', handler);
    return () => window.removeEventListener('design:updated', handler);
  }, [triggerRefresh]);

  return (
    <SessionContext.Provider value={{
      sessionId, setSessionId,
      uploadData, setUploadData,
      currentStage, setCurrentStage,
      refreshTrigger, triggerRefresh,
      pushStage,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
