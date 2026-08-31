import { useEffect, useRef } from 'react';

export interface UseIngestionPollOptions {
  /** When false, polling is paused. Defaults to true. */
  enabled?: boolean;
  /** Poll interval in milliseconds. Defaults to 2500. */
  intervalMs?: number;
  /** When provided, polling continues only while this returns true. */
  whileActive?: () => boolean;
}

/**
 * Runs `callback` on an interval while `enabled` and optional `whileActive` permit.
 * Used for parse jobs and agent drafting states (same cadence as the test UI).
 */
export function useIngestionPoll(
  callback: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs = 2500,
    whileActive,
  }: UseIngestionPollOptions = {},
): void {
  const callbackRef = useRef(callback);
  const whileActiveRef = useRef(whileActive);

  callbackRef.current = callback;
  whileActiveRef.current = whileActive;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (whileActiveRef.current && !whileActiveRef.current()) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      try {
        await callbackRef.current();
      } catch {
        // Caller owns error surfacing; keep polling.
      }
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
      }
    };

    timer = setTimeout(tick, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs]);
}
