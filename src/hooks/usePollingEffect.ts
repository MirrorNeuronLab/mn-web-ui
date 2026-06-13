import { useEffect } from 'react';

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
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void callback();
    };
    const initialTimer = window.setTimeout(() => {
      onInitialPoll?.();
      run();
    }, initialDelayMs);
    const refreshTimer = window.setInterval(run, intervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [callback, enabled, initialDelayMs, intervalMs, onInitialPoll]);
}
