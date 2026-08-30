import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getTechnicalGraphRun,
  postTechnicalGraphAction,
  startTechnicalGraphRun,
  type TechnicalGraphAction,
  type TechnicalGraphUiResponse,
} from '@/app/services/api/technicalGraph';
import {
  PRIMARY_TECHNICAL_GRAPH_ACTIONS,
  SEGMENT_ACTIONS,
  isTechnicalGraphComplete,
  nextGraphSegmentId,
  subsystemsFromDiscoveryPlan,
} from '../utils/technicalGraphMappers';
import type { SubsystemSummary } from '@/app/services/api';

const STORAGE_PREFIX = 'technical-graph-run:';

function storageKey(designId: string) {
  return `${STORAGE_PREFIX}${designId}`;
}

export interface UseTechnicalGraphRun {
  envelope: TechnicalGraphUiResponse | null;
  runId: string | null;
  view: string | null;
  status: string | null;
  phase: string | null;
  data: Record<string, unknown>;
  actions: TechnicalGraphAction[];
  primaryActions: TechnicalGraphAction[];
  subsystemSummaries: SubsystemSummary[];
  busy: boolean;
  error: string | null;
  isComplete: boolean;
  hasRun: boolean;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  dispatch: (actionId: string, extra?: Record<string, unknown>) => Promise<void>;
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;
}

export function useTechnicalGraphRun(designId: string | null): UseTechnicalGraphRun {
  const [envelope, setEnvelope] = useState<TechnicalGraphUiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyEnvelope = useCallback((next: TechnicalGraphUiResponse) => {
    if (!mountedRef.current) return;
    setEnvelope(next);
    setError(null);
    if (next.run_id && designId) {
      sessionStorage.setItem(storageKey(designId), next.run_id);
    }
    const nextId = nextGraphSegmentId(next.data || {});
    if (nextId) setSelectedSegmentId(nextId);
  }, [designId]);

  // Restore prior run for this design on mount.
  useEffect(() => {
    if (!designId) return;
    const saved = sessionStorage.getItem(storageKey(designId));
    if (!saved) return;
    let cancelled = false;
    void getTechnicalGraphRun(saved)
      .then((payload) => {
        if (!cancelled) applyEnvelope(payload);
      })
      .catch(() => {
        sessionStorage.removeItem(storageKey(designId));
      });
    return () => {
      cancelled = true;
    };
  }, [applyEnvelope, designId]);

  const start = useCallback(async () => {
    if (!designId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await startTechnicalGraphRun({ design_id: designId });
      applyEnvelope(payload);
      toast.success('Technical graph run started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start technical graph run';
      if (mountedRef.current) setError(msg);
      toast.error(msg);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [applyEnvelope, busy, designId]);

  const refresh = useCallback(async () => {
    if (!envelope?.run_id) return;
    setBusy(true);
    try {
      const payload = await getTechnicalGraphRun(envelope.run_id);
      applyEnvelope(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh technical graph run';
      if (mountedRef.current) setError(msg);
      toast.error(msg);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [applyEnvelope, envelope?.run_id]);

  const dispatch = useCallback(async (actionId: string, extra: Record<string, unknown> = {}) => {
    if (!envelope?.run_id || busy) return;
    const allowed = (envelope.actions || []).some((action) => action.id === actionId);
    if (!allowed) {
      toast.error(`Action "${actionId}" is not available in the current step.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { action: actionId, ...extra };
      if (SEGMENT_ACTIONS.has(actionId) && !body.graph_segment_id) {
        const segmentId =
          selectedSegmentId ||
          nextGraphSegmentId(envelope.data || {});
        if (segmentId) body.graph_segment_id = segmentId;
      }
      const payload = await postTechnicalGraphAction(
        envelope.run_id,
        body as unknown as Parameters<typeof postTechnicalGraphAction>[1],
      );
      applyEnvelope(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to run ${actionId}`;
      if (mountedRef.current) setError(msg);
      toast.error(msg);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [applyEnvelope, busy, envelope, selectedSegmentId]);

  const data = (envelope?.data || {}) as Record<string, unknown>;
  const subsystemSummaries = useMemo(
    () => subsystemsFromDiscoveryPlan(data),
    [data],
  );
  const primaryActions = useMemo(
    () => (envelope?.actions || []).filter((action) => PRIMARY_TECHNICAL_GRAPH_ACTIONS.has(action.id)),
    [envelope?.actions],
  );

  return {
    envelope,
    runId: envelope?.run_id ?? null,
    view: envelope?.view ?? null,
    status: envelope?.status ?? null,
    phase: envelope?.phase ?? null,
    data,
    actions: envelope?.actions || [],
    primaryActions,
    subsystemSummaries,
    busy,
    error,
    isComplete: isTechnicalGraphComplete(envelope),
    hasRun: Boolean(envelope?.run_id),
    start,
    refresh,
    dispatch,
    selectedSegmentId,
    setSelectedSegmentId,
  };
}
