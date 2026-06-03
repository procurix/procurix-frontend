import { useEffect } from 'react';
import { AnalysisView } from './components/AnalysisView';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';

export function AnalysisPage() {
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const { navigateToStage } = useWorkflowNavigation();

  // Sync session ID from query params
  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  // Update URL with session ID if it exists in context but not in URL
  useEffect(() => {
    if (contextSessionId && !querySessionId) {
      updateParams(contextSessionId);
    }
  }, [contextSessionId, querySessionId, updateParams]);

  const handleSystemTypeSelected = (systemType: string) => {
    toast.success(`System type selected: ${systemType}`);
    navigateToStage('classification');
  };

  return <AnalysisView onSystemTypeSelected={handleSystemTypeSelected} />;
}
