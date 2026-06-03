import { useCallback } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router-dom';
import { useSession } from '@/app/context/SessionContext';
import type { SessionStage } from '@/app/types';
import { getStageNumber, STAGE_TO_ROUTE, withSession } from '@/app/shared/utils/workflowStages';
import { useQueryParams } from './useQueryParams';

export function useWorkflowNavigation() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, pushStage } = useSession();
  const { sessionId: querySessionId } = useQueryParams();
  const activeSessionId = querySessionId || contextSessionId;

  const unlockStage = useCallback((stage: SessionStage) => {
    const stageNumber = getStageNumber(stage);
    if (stageNumber !== null) {
      pushStage(stageNumber);
    }
  }, [pushStage]);

  const navigateToStage = useCallback((stage: SessionStage, options?: NavigateOptions) => {
    const route = STAGE_TO_ROUTE[stage];
    if (!route) return;

    unlockStage(stage);
    navigate(withSession(route, activeSessionId), options);
  }, [activeSessionId, navigate, unlockStage]);

  return {
    activeSessionId,
    navigateToStage,
    unlockStage,
  };
}
