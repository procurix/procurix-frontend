import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  generateRequirements,
  getRequirementsGET,
  type Requirement as APIRequirement,
} from '@/app/services/api';
import type { RequirementsWorkspaceView, ReviewFilter } from '../types';
import {
  confidencePercent,
  hasQualityGap,
  normalizeRequirementForUi,
  requirementReviewBlockers,
} from '../utils';

export function useRequirementsData(sessionId?: string | null, refreshTrigger?: number) {
  const [requirements, setRequirements] = useState<APIRequirement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // isLoading: initial GET check on mount / session change
  const [isLoading, setIsLoading] = useState(true);
  // isGenerating: AI generation actively in flight (user triggered)
  const [isGenerating, setIsGenerating] = useState(false);
  // needsGeneration: GET returned empty and generation has not been triggered this session
  const [needsGeneration, setNeedsGeneration] = useState(false);
  // generationComplete: generation was triggered and finished (result may still be empty)
  const [generationComplete, setGenerationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [workspaceView, setWorkspaceView] = useState<RequirementsWorkspaceView>('review');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const applyRequirements = useCallback((items: APIRequirement[]) => {
    const next = items.map(normalizeRequirementForUi);
    setRequirements(next);
    setSelectedId(prev =>
      prev && next.some(req => req.req_id === prev) ? prev : next[0]?.req_id ?? null,
    );
    return next;
  }, []);

  const reloadRequirements = useCallback(async () => {
    if (!sessionId) return [];
    const result = await getRequirementsGET(sessionId);
    return applyRequirements(result.requirements);
  }, [applyRequirements, sessionId]);

  // On mount / session change: read existing requirements only. Never auto-generates.
  useEffect(() => {
    let isCurrent = true;

    const readRequirements = async () => {
      if (!sessionId) {
        if (isCurrent) {
          setIsLoading(false);
          setNeedsGeneration(false);
          setError('No session found. Please upload a BOM first.');
        }
        return;
      }

      if (isCurrent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const result = await getRequirementsGET(sessionId);
        if (!isCurrent) return;
        if (!result.success) throw new Error('Requirements request was not successful');

        if (result.requirements.length > 0) {
          applyRequirements(result.requirements);
          setNeedsGeneration(false);
        } else {
          // Requirements table is empty — generation has not been triggered yet.
          setNeedsGeneration(true);
        }
        setIsLoading(false);
      } catch (err) {
        if (!isCurrent) return;
        setIsLoading(false);
        const rawMessage = err instanceof Error ? err.message : 'Failed to fetch requirements';
        const errorMessage = rawMessage.includes('409')
          ? 'Part Review must be confirmed before requirements can be generated.'
          : rawMessage;
        setError(errorMessage);
        toast.error(errorMessage);
      }
    };

    readRequirements();
    return () => { isCurrent = false; };
  }, [applyRequirements, sessionId, refreshTrigger, retryCount]);

  // Explicit generation trigger — only called from the "Generate Requirements" button.
  const triggerGeneration = useCallback(async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    setNeedsGeneration(false);
    setGenerationComplete(false);
    setError(null);

    try {
      const result = await generateRequirements(sessionId);
      if (!mountedRef.current) return;
      if (!result.success) throw new Error('Requirements generation failed');
      applyRequirements(result.requirements);
      setGenerationComplete(true);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to generate requirements';
      setError(msg);
      setNeedsGeneration(true); // allow retry via Generate button
      toast.error(msg);
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [applyRequirements, sessionId]);

  const categories = useMemo(
    () => Array.from(new Set(requirements.map(req => req.category || 'functional'))).sort(),
    [requirements],
  );

  const filteredRequirements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return requirements.filter(req => {
      if (categoryFilter !== 'all' && req.category !== categoryFilter) return false;
      if (reviewFilter === 'open' && ['confirmed', 'rejected'].includes(req.status ?? 'suggested')) return false;
      if (reviewFilter === 'approved' && req.status !== 'confirmed') return false;
      if (reviewFilter === 'gaps' && !hasQualityGap(req)) return false;
      if (reviewFilter === 'low-confidence' && confidencePercent(req) >= 70) return false;
      if (!query) return true;
      return [
        req.req_key,
        req.title,
        req.description,
        req.specification,
        req.category,
        req.priority,
        req.status,
        ...(req.source_mpns ?? []),
        ...(req.source_standards ?? []),
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
    });
  }, [requirements, searchQuery, categoryFilter, reviewFilter]);

  const selectedRequirement = useMemo(
    () =>
      requirements.find(req => req.req_id === selectedId) ??
      filteredRequirements[0] ??
      requirements[0] ??
      null,
    [requirements, selectedId, filteredRequirements],
  );

  const summary = useMemo(() => {
    const approved = requirements.filter(req => req.status === 'confirmed').length;
    const rejected = requirements.filter(req => req.status === 'rejected').length;
    const open = requirements.filter(
      req => !['confirmed', 'rejected'].includes(req.status ?? 'suggested'),
    ).length;
    const gaps = requirements.filter(hasQualityGap).length;
    return { approved, rejected, open, gaps };
  }, [requirements]);

  const reviewBlockers = useMemo(() => requirementReviewBlockers(requirements), [requirements]);

  const upsertRequirement = useCallback((req: APIRequirement) => {
    const normalized = normalizeRequirementForUi(req);
    setRequirements(prev => {
      const exists = prev.some(item => item.req_id === normalized.req_id);
      return exists
        ? prev.map(item => (item.req_id === normalized.req_id ? normalized : item))
        : [...prev, normalized];
    });
    setSelectedId(normalized.req_id);
  }, []);

  return {
    requirements,
    setRequirements,
    selectedId,
    setSelectedId,
    selectedRequirement,
    isLoading,
    isGenerating,
    needsGeneration,
    generationComplete,
    triggerGeneration,
    error,
    retry: () => setRetryCount(count => count + 1),
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    reviewFilter,
    setReviewFilter,
    workspaceView,
    setWorkspaceView,
    categories,
    filteredRequirements,
    summary,
    reviewBlockers,
    reloadRequirements,
    upsertRequirement,
  };
}
