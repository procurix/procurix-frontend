import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '@/app/context/SessionContext';
import {
  getDesignDefinition,
  type DesignDefinitionResponse,
  type DesignLens,
  type SelectedEntity,
} from '@/app/services/api/legacy';
import { WorkspaceContext, type WorkspaceContextType } from './workspaceStore';

export type ReviewFilter = 'all' | 'blocking' | 'warning';

const VALID_LENSES: DesignLens[] = ['architecture', 'requirements', 'subsystems', 'interfaces', 'review'];

function isDesignLens(value: string | null): value is DesignLens {
  return Boolean(value && VALID_LENSES.includes(value as DesignLens));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sessionId } = useSession();
  const querySession = searchParams.get('session');
  const designId = querySession || sessionId || '';
  const activeLens = isDesignLens(searchParams.get('lens')) ? searchParams.get('lens') as DesignLens : 'architecture';
  const [definition, setDefinition] = useState<DesignDefinitionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    const lens = searchParams.get('lens');

    if (!querySession && sessionId) {
      next.set('session', sessionId);
      changed = true;
    }
    if (!isDesignLens(lens)) {
      next.set('lens', 'architecture');
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [querySession, searchParams, sessionId, setSearchParams]);

  const refresh = useCallback(async () => {
    if (!designId) {
      setDefinition(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDesignDefinition(designId);
      setDefinition(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load design definition');
    } finally {
      setIsLoading(false);
    }
  }, [designId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveLens = useCallback((lens: DesignLens) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (designId) next.set('session', designId);
      next.set('lens', lens);
      return next;
    });
  }, [designId, setSearchParams]);

  const value = useMemo<WorkspaceContextType>(() => ({
    designId,
    definition,
    isLoading,
    error,
    activeLens,
    setActiveLens,
    selectedEntity,
    setSelectedEntity,
    reviewFilter,
    setReviewFilter,
    refresh,
  }), [
    activeLens,
    definition,
    designId,
    error,
    isLoading,
    refresh,
    reviewFilter,
    selectedEntity,
    setActiveLens,
  ]);

  if (!designId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">No active design</h1>
          <p className="mt-2 text-sm text-slate-600">Open a design session before using Design Definition.</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Go to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
