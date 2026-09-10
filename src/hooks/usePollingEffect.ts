import { useEffect, useRef } from 'react';

type PollingOptions = {
  intervalMs: number;
  initialDelayMs?: number;
  enabled?: boolean;
  onInitialPoll?: () => void;
  onError?: (error: unknown) => void;
  /** Stop scheduling after this many consecutive failures (default: keep polling). */
  maxConsecutiveFailures?: number;
  /** Cap for backoff delay between polls (default 30s). */
  maxDelayMs?: number;
};

const scheduleOn = (fn: () => void, delayMs: number): number => (
  globalThis.setTimeout(fn, delayMs) as unknown as number
);

const clearScheduled = (timer: number | undefined) => {
  if (timer !== undefined) globalThis.clearTimeout(timer);
};

export function usePollingEffect(
  callback: () => void | Promise<void>,
  {
    intervalMs,
    initialDelayMs = 0,
    enabled = true,
    onInitialPoll,
    onError,
    maxConsecutiveFailures = Number.POSITIVE_INFINITY,
    maxDelayMs = 30_000,
  }: PollingOptions,
) {
  const onInitialPollRef = useRef(onInitialPoll);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onInitialPollRef.current = onInitialPoll;
  }, [onInitialPoll]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshTimer: number | undefined;
    let consecutiveFailures = 0;

    const nextDelay = () => {
      if (consecutiveFailures === 0) return intervalMs;
      const backoff = intervalMs * 2 ** Math.min(consecutiveFailures - 1, 5);
      const jitter = backoff * (0.8 + Math.random() * 0.4);
      return Math.min(jitter, maxDelayMs);
    };

    const run = async () => {
      if (cancelled) return;
      try {
        await callback();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        // A stale run (cleaned up while in flight, e.g. filter changed or
        // unmount) must not report or reschedule over newer state.
        if (cancelled) return;
        onErrorRef.current?.(error);
        if (consecutiveFailures >= maxConsecutiveFailures) return;
      }
      if (!cancelled) {
        refreshTimer = scheduleOn(() => void run(), nextDelay());
      }
    };
    const initialTimer = scheduleOn(() => {
      if (cancelled) return;
      onInitialPollRef.current?.();
      void run();
    }, initialDelayMs);

    return () => {
      cancelled = true;
      clearScheduled(initialTimer);
      clearScheduled(refreshTimer);
    };
  }, [callback, enabled, initialDelayMs, intervalMs, maxConsecutiveFailures, maxDelayMs]);
}
