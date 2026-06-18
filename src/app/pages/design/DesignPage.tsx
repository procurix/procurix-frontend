import { useEffect } from 'react';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { useWorkflowNavigation } from '@/app/shared/hooks/useWorkflowNavigation';
import { RequirementsRail } from './components/RequirementsRail';
import { DesignCanvas } from './components/DesignCanvas';
import { SubsystemPanel } from './components/SubsystemPanel';
import { RequirementEditModal } from './components/RequirementEditModal';
import { DesignProvider, useDesignContext } from './state/DesignContext';

export function DesignPage() {
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const { activeSessionId } = useWorkflowNavigation();

  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) setSessionId(querySessionId);
  }, [querySessionId, contextSessionId, setSessionId]);

  useEffect(() => {
    if (contextSessionId && !querySessionId) updateParams(contextSessionId);
  }, [contextSessionId, querySessionId, updateParams]);

  if (!activeSessionId) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">
        No session found. Upload a BOM to begin.
      </div>
    );
  }

  return (
    <DesignProvider sessionId={activeSessionId}>
      <DesignWorkspace />
    </DesignProvider>
  );
}

function DesignWorkspace() {
  const { panelOpenSubsystemId } = useDesignContext();
  const railCollapsed = panelOpenSubsystemId !== null;

  return (
    <div className="flex h-[calc(100vh-7rem)] w-full overflow-hidden border-t border-slate-200">
      <aside
        className={`shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ${
          railCollapsed ? 'w-14' : 'w-[320px]'
        }`}
      >
        <RequirementsRail collapsed={railCollapsed} />
      </aside>
      <main className="flex-1 min-w-0 bg-slate-50">
        <DesignCanvas />
      </main>
      <SubsystemPanel />
      <RequirementEditModal />
    </div>
  );
}
