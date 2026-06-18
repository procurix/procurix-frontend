import { useEffect, useRef, useState } from 'react';
import { UploadView } from './components/UploadView';
import { PostUploadSystemId } from './components/PostUploadSystemId';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';

/**
 * Combined upload + system identification flow.
 *
 * Phase 1 (default): UploadView — dropzone, mapping confirmation, commit.
 * Phase 2 (after commit): PostUploadSystemId — three-column view with parts
 *   sidebar, chat console, and suggestion cards. User confirms a system type
 *   here, then proceeds to part identification.
 *
 * No URL change between phases — same page, same session ID in context.
 */
export function UploadPage() {
  const { sessionId: contextSessionId, setSessionId, setCurrentStage, setUploadData } = useSession();
  const { sessionId: querySessionId } = useQueryParams();
  const { navigateToStage } = useWorkflowNavigation();
  const initialQuerySessionId = useRef(querySessionId);

  // Phase 2 state: once an upload commits we get its sessionId + filename +
  // part_count, and we render the system-id sub-view.
  const [postUpload, setPostUpload] = useState<{
    sessionId: string;
    fileName: string;
    partCount: number;
  } | null>(null);

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

  const handleUploadComplete = (data: {
    sessionId: string;
    fileName: string;
    part_count: number;
  }) => {
    toast.success('BOM uploaded — analyzing system type');
    setPostUpload({
      sessionId: data.sessionId,
      fileName: data.fileName,
      partCount: data.part_count,
    });
  };

  // Upload now covers BOM ingest + part identification + system type
  // confirmation as one step. Next user-visible stage is Classification.
  // Use navigateToStage so SessionContext's optimistic stage is bumped to 2
  // *before* the route change — otherwise Layout's bounce guard reads stale
  // max-reached stage 1 and redirects right back to /upload.
  const handleProceedToClassification = () => {
    navigateToStage('classification');
  };

  if (postUpload) {
    return (
      <PostUploadSystemId
        sessionId={postUpload.sessionId}
        bomFileName={postUpload.fileName}
        partCount={postUpload.partCount}
        onProceed={handleProceedToClassification}
      />
    );
  }

  return (
    <UploadView
      onUploadComplete={handleUploadComplete}
      onProceedToClassification={handleProceedToClassification}
    />
  );
}
