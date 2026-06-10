import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BOMLibrary } from './components/BOMLibrary';
import { getAllBOMs } from '@/app/services/api';
import type { BOMSession, SessionStage } from '@/app/types';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { getRouteForStage, getStageForNumber, withSession } from '@/app/shared/utils/workflowStages';

const PAGE_SIZE = 20;

export function LibraryPage() {
  const navigate = useNavigate();
  const { setSessionId, setCurrentStage, setUploadData } = useSession();
  const [sessions, setSessions] = useState<BOMSession[]>([]);
  const [sessionStageMap, setSessionStageMap] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [totalInProgress, setTotalInProgress] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (pageOffset: number, append: boolean) => {
    const response = await getAllBOMs({ limit: PAGE_SIZE, offset: pageOffset });

    const stageMap = new Map<string, number>();
    const transformedSessions: BOMSession[] = response.boms.map((bom) => {
      const stage = getStageForNumber(bom.current_stage) as SessionStage;
      const isComplete = bom.current_stage >= 10;
      stageMap.set(bom.bom_id, bom.current_stage);
      return {
        id: bom.bom_id,
        name: bom.system_type || `BOM ${bom.bom_id.slice(0, 8)}`,
        systemType: bom.system_type,
        version: 1,
        stage,
        components: [],
        requirements: [],
        subsystems: [],
        complianceScore: isComplete ? undefined : undefined,
        totalComponents: bom.total_parts,
        compliantComponents: 0,
        createdAt: new Date(bom.created_at),
        updatedAt: new Date(bom.created_at),
        currentStageNumber: bom.current_stage,
      } as BOMSession & { currentStageNumber: number };
    });

    setSessions(prev => append ? [...prev, ...transformedSessions] : transformedSessions);
    setSessionStageMap(prev => {
      const next = append ? new Map(prev) : new Map<string, number>();
      for (const [k, v] of stageMap) next.set(k, v);
      return next;
    });
    setTotal(response.total);
    setTotalCompleted(response.total_completed);
    setTotalInProgress(response.total_in_progress);
    setOffset(pageOffset + response.boms.length);
    setHasMore(response.has_more);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setIsLoading(true);
        await fetchPage(0, false);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load BOMs';
        toast.error(message);
        console.error('Error fetching BOMs:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      await fetchPage(offset, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load more BOMs';
      toast.error(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, isLoadingMore, hasMore, offset]);

  const handleSelectSession = (session: BOMSession) => {
    setSessionId(session.id);
    const currentStage = sessionStageMap.get(session.id) || 1;
    setCurrentStage(currentStage);
    const route = getRouteForStage(currentStage);
    navigate(withSession(route, session.id));
  };

  const handleNewBOM = () => {
    setSessionId(null);
    setCurrentStage(null);
    setUploadData(null);
    navigate('/upload', { replace: true, state: {} });
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-600">Loading BOMs...</p>
        </div>
      </div>
    );
  }

  return (
    <BOMLibrary
      sessions={sessions}
      onSelectSession={handleSelectSession}
      onNewBOM={handleNewBOM}
      total={total}
      totalCompleted={totalCompleted}
      totalInProgress={totalInProgress}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={handleLoadMore}
    />
  );
}
