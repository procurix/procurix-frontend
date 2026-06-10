/**
 * Classification Page — Aux/Non-Aux segregation.
 *
 * Runs AFTER System Identification. Uses FundamentalClassificationView in
 * forceClassifyPhase mode (skips Research + Selection — Part ID was done on
 * the /part-identification page). Navigates to /validate on complete.
 */

import { useEffect } from 'react';
import { FundamentalClassificationView } from '../fundamental/components/FundamentalClassificationView';
import type { Component } from '@/app/types';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';

export function ClassificationPage() {
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const { navigateToStage } = useWorkflowNavigation();

  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  useEffect(() => {
    if (contextSessionId && !querySessionId) {
      updateParams(contextSessionId);
    }
  }, [contextSessionId, querySessionId, updateParams]);

  const handleClassificationComplete = (classifiedComponents: Component[]) => {
    const fundamentalCount = classifiedComponents.filter(c => c.isFundamental === true).length;
    const auxiliaryCount = classifiedComponents.filter(c => c.isFundamental === false).length;

    console.log('[classification-page] handleClassificationComplete called; fundamental=', fundamentalCount, 'aux=', auxiliaryCount, '→ navigating to enrichment');
    toast.success(`Classification complete! ${fundamentalCount} fundamental, ${auxiliaryCount} auxiliary`);
    navigateToStage('enrichment');
  };

  return (
    <FundamentalClassificationView
      components={[]}
      onClassificationComplete={handleClassificationComplete}
      forceClassifyPhase
    />
  );
}
