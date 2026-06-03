import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReviewStage } from './components/ReviewStage';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import {
  getDesign,
  getClassification,
  getSystemAnalysis,
  type PartDetail,
} from '@/app/services/api';
import type { BOMSession, Component } from '@/app/types';

function _buildSession(
  designId: string,
  projectName: string | null,
  systemType: string | null,
  classificationParts: PartDetail[],
): BOMSession {
  const components: Component[] = classificationParts.map((p) => ({
    id: p.part_number,
    reference: p.part_number,
    partNumber: p.part_number,
    manufacturer: p.manufacturer ?? undefined,
    type: p.category ?? 'unknown',
    description: p.description ?? '',
    specs: {},
    isIdentified: !!p.part_number,
    isGeneric: p.source === 'generic',
    isFundamental: p.classification === 'non-auxiliary',
    complianceStatus: 'unknown' as const,
  }));

  return {
    id: designId,
    name: projectName || designId,
    systemType: systemType ?? undefined,
    version: 1,
    stage: 'review',
    components,
    requirements: [],
    subsystems: [],
    complianceScore: 0,
    totalComponents: components.length,
    compliantComponents: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function ReviewPage() {
  const navigate = useNavigate();
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId, updateParams } = useQueryParams();
  const [session, setSession] = useState<BOMSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeSessionId = querySessionId || contextSessionId;

  useEffect(() => {
    if (querySessionId && querySessionId !== contextSessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, contextSessionId, setSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      setError('No session ID — navigate here from a previous step.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    if (!querySessionId) updateParams(activeSessionId);

    async function load() {
      try {
        const [design, analysis, classification] = await Promise.all([
          getDesign(activeSessionId!),
          getSystemAnalysis(activeSessionId!).catch(() => null),
          getClassification(activeSessionId!).catch(() => ({ parts: [], classification_map: {} })),
        ]);

        if (cancelled) return;

        const built = _buildSession(
          activeSessionId!,
          design.project_name,
          analysis?.system_type ?? null,
          classification.parts,
        );
        setSession(built);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load review data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeSessionId, querySessionId, updateParams]);

  const handleNavigateToStage = (stage: string) => {
    if (stage === 'upload') return;
    const routes: Record<string, string> = {
      discovery: '/discovery',
      identify: '/identify',
      'part-identification': '/part-identification',
      architecture: '/architecture',
      requirements: '/requirements',
      subsystems: '/subsystems',
    };
    const route = routes[stage];
    if (route) navigate(`${route}?session=${activeSessionId}`);
  };

  const handleSubmit = () => {
    toast.success('BOM submitted successfully!');
    navigate('/completed');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading review...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">{error ?? 'No data available.'}</div>
      </div>
    );
  }

  return (
    <ReviewStage
      session={session}
      onNavigateToStage={handleNavigateToStage}
      onSubmit={handleSubmit}
    />
  );
}
