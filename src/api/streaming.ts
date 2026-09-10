import type { z } from 'zod';

type StreamOptions<T> = {
  schema: z.ZodType<T>;
  streamUrl: (id: string) => string;
  authHeader: () => Record<string, string>;
  validationLabel: (id: string) => string;
  /** Maximum fetch reconnect attempts before giving up (default 10). */
  maxReconnectAttempts?: number;
  /** Cap for reconnect backoff (default 5000ms). */
  maxReconnectDelayMs?: number;
  /** Receives terminal stream failures instead of them being swallowed. */
  onError?: (error: unknown) => void;
};

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 5_000;

const handleWorkflowProgressStreamData = <T>(
  options: StreamOptions<T>,
  id: string,
  data: string,
  seenEventIds: Set<string>,
  eventId: string | undefined,
  onSnapshot: (snapshot: T) => void,
) => {
  // Deduplicate: the same SSE id must never overwrite newer state twice.
  if (eventId) {
    if (seenEventIds.has(eventId)) return;
    seenEventIds.add(eventId);
    if (seenEventIds.size > 500) {
      const oldest = seenEventIds.values().next().value;
      if (oldest !== undefined) seenEventIds.delete(oldest);
    }
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch (error) {
    console.error(`${options.validationLabel(id)} JSON parse failed:`, error);
    return;
  }

  const candidate = payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
    ? (payload as { data: unknown }).data
    : payload;
  const parsed = options.schema.safeParse(candidate);
  if (parsed.success) {
    onSnapshot(parsed.data);
  } else {
    console.error(`${options.validationLabel(id)} validation failed:`, parsed.error);
  }
};

const delayCancellable = (delayMs: number, signal?: AbortSignal): Promise<void> => (
  new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(resolve, delayMs) as unknown as number;
    if (!signal) return;
    if (signal.aborted) {
      globalThis.clearTimeout(timeout);
      resolve();
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  })
);

export const createWorkflowProgressStreamer = <T>(options: StreamOptions<T>) => async (
  id: string,
  onSnapshot: (snapshot: T) => void,
  signal?: AbortSignal,
  onHeartbeat?: () => void,
) => {
  const maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
  const reportError = (error: unknown) => {
    if (signal?.aborted) return;
    if (error instanceof Error && error.name === 'AbortError') return;
    options.onError?.(error);
  };
  const headers = options.authHeader();
  if (typeof EventSource !== 'undefined' && Object.keys(headers).length === 0) {
    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(options.streamUrl(id));
      let settled = false;
      let failures = 0;
      const seenEventIds = new Set<string>();
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        source.close();
        signal?.removeEventListener('abort', abort);
        if (error) {
          reportError(error);
          reject(error);
        } else resolve();
      };
      const abort = () => finish();
      const track = (event: MessageEvent) => {
        const messageEvent = event as MessageEvent & { lastEventId?: string };
        handleWorkflowProgressStreamData(options, id, messageEvent.data, seenEventIds, messageEvent.lastEventId || undefined, onSnapshot);
      };
      source.addEventListener('snapshot', track as EventListener);
      source.addEventListener('run.snapshot', track as EventListener);
      source.addEventListener('run.completed', (event) => {
        track(event as MessageEvent);
        finish();
      });
      source.addEventListener('heartbeat', () => {
        onHeartbeat?.();
      });
      source.onerror = () => {
        if (signal?.aborted) {
          finish();
          return;
        }
        failures += 1;
        if (failures > maxReconnectAttempts) {
          finish(new Error(`${options.validationLabel(id)} reconnect limit reached (${maxReconnectAttempts}).`));
        }
        // Otherwise the native EventSource keeps its own bounded retry loop.
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    return;
  }

  let lastEventId = '';
  const seenEventIds = new Set<string>();
  let reconnectDelayMs = 250;
  let attempts = 0;
  while (!signal?.aborted) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await fetch(options.streamUrl(id), {
        headers: lastEventId ? { ...headers, 'Last-Event-ID': lastEventId } : headers,
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`workflow progress stream failed: ${response.status}`);
      }
      attempts = 0;
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (!signal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\n\n/);
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          const eventId = lines.find((line) => line.startsWith('id:'))?.slice(3).trim();
          if (eventId) lastEventId = eventId;
          if (lines.every((line) => line.startsWith(':'))) {
            onHeartbeat?.();
            continue;
          }
          const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
          const data = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (eventName === 'heartbeat') {
            onHeartbeat?.();
            continue;
          }
          if (!['snapshot', 'run.snapshot', 'run.completed'].includes(eventName) || !data) continue;
          handleWorkflowProgressStreamData(options, id, data, seenEventIds, eventId, onSnapshot);
          if (eventName === 'run.completed') {
            completed = true;
            break;
          }
        }
        if (completed) break;
      }
      if (completed) return;
      reconnectDelayMs = 250;
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof Error && error.name === 'AbortError') return;
      attempts += 1;
      reportError(error);
      if (attempts > maxReconnectAttempts) {
        throw error;
      }
    } finally {
      try {
        await reader?.cancel();
      } catch {
        // Reader may already be closed; cleanup is best-effort.
      }
      try {
        reader?.releaseLock();
      } catch {
        // Lock may already be released.
      }
    }
    if (signal?.aborted) return;
    await delayCancellable(reconnectDelayMs, signal);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
  }
};
