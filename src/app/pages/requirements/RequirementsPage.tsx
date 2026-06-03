import { useEffect } from 'react';
import { RequirementsView } from './components/RequirementsView';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { updateCurrentStageInContext } from '@/app/services/api';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';

export function RequirementsPage() {
  const { sessionId: contextSessionId, setSessionId, setCurrentStage } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const { activeSessionId, navigateToStage } = useWorkflowNavigation();

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

  const handleRequirementsComplete = async () => {
    // Update current stage when user explicitly completes requirements step
    if (activeSessionId && setCurrentStage) {
      try {
        await updateCurrentStageInContext(activeSessionId, setCurrentStage);
      } catch (error) {
        console.error('Error updating stage after requirements completion:', error);
      }
    }
    
    toast.success('Requirements confirmed!');
    navigateToStage('architecture');
  };

  const handleOpenPartReview = () => {
    navigateToStage('validate');
  };

  return (
    <RequirementsView
      designId={activeSessionId}
      onRequirementsComplete={handleRequirementsComplete}
      onOpenPartReview={handleOpenPartReview}
    />
  );
}
