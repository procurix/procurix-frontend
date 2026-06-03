import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadView } from './components/UploadView';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';

export function UploadPage() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, setSessionId, setCurrentStage, setUploadData } = useSession();
  const { sessionId: querySessionId } = useQueryParams();
  const initialQuerySessionId = useRef(querySessionId);

  // Clear session context only for an explicit fresh upload route. If the
  // route has ?session=..., preserve it; guards may send users here for a
  // not-yet-uploaded design, and clearing would orphan that design.
  useEffect(() => {
    if (initialQuerySessionId.current) {
      setSessionId(initialQuerySessionId.current);
      return;
    }

    setSessionId(null);
    setCurrentStage(null);
    setUploadData(null);
  }, [setCurrentStage, setSessionId, setUploadData]); // Only run on mount to handle new uploads

  // Sync session ID from query params (only when query param changes and we have a valid session)
  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  const handleUploadComplete = (_data: { sessionId: string }) => {
    toast.success('BOM uploaded successfully!');
    // Navigation is deferred to the user clicking "Start Part Identification",
    // which fires onProceedToClassification. The session ID is already in
    // context (set by UploadView before this callback fires).
  };

  const handleProceedToClassification = () => {
    const activeSessionId = contextSessionId || querySessionId;
    if (activeSessionId) {
      navigate(`/part-identification?session=${activeSessionId}`);
    } else {
      navigate('/part-identification');
    }
  };

  return (
    <UploadView 
      onUploadComplete={handleUploadComplete}
      onProceedToClassification={handleProceedToClassification}
    />
  );
}
