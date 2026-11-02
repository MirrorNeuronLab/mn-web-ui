import { useEffect, useState } from 'react';
import { getApiBaseUrl, getAuthHeader } from '../api/client';
import { runPath } from '../api/routes';
import { mergeRuntimeSignal, streamRuntimeSignals, type RuntimeSignal } from '../api/runtimeSignals';

/** Observation lasts for the mounted monitor, independently of bulk progress. */
export function useRuntimeSignals(runId: string | undefined, attempt = 0) {
  const [projection, setProjection] = useState<{ runId?: string; events: RuntimeSignal[]; unavailable: string | null }>({
    events: [], unavailable: null,
  });
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let events: RuntimeSignal[] = [];
    const transport = new Map<string, string>();
    const publish = () => {
      if (!controller.signal.aborted) setProjection({ runId, events, unavailable: [...transport.values()].join(' ') || null });
    };
    for (const channel of ['errors', 'responses']) {
      void streamRuntimeSignals(
        `${getApiBaseUrl()}${runPath(runId, '/signals/stream')}?channel=${channel}`,
        getAuthHeader(), controller.signal,
        event => { events = mergeRuntimeSignal(events, event); publish(); },
        message => { if (message) transport.set(channel, message); else transport.delete(channel); publish(); },
      );
    }
    return () => controller.abort();
  }, [runId, attempt]);
  return projection.runId === runId ? projection : { events: [], unavailable: null };
}
