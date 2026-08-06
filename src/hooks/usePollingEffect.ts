import { useEffect, useRef } from 'react';

type PollingOptions = {
  intervalMs: number;
  initialDelayMs?: number;
  enabled?: boolean;
  onInitialPoll?: () => void;
};

export function usePollingEffect(
  callback: () => void | Promise<void>,
  {
    intervalMs,
    initialDelayMs = 0,
    enabled = true,
    onInitialPoll,
  }: PollingOptions,
) {
  const onInitialPollRef = useRef(onInitialPoll);

  useEffect(() => {
    onInitialPollRef.current = onInitialPoll;
  }, [onInitialPoll]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshTimer: number | undefined;
    const run = async () => {
      if (cancelled) return;
      try {
        await callback();
      } finally {
        if (!cancelled) {
          refreshTimer = window.setTimeout(() => void run(), intervalMs);
        }
      }
    };
    const initialTimer = window.setTimeout(() => {
      onInitialPollRef.current?.();
      void run();
    }, initialDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [callback, enabled, initialDelayMs, intervalMs]);
}
