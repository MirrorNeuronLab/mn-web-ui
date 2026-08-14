import type { z } from 'zod';

type StreamOptions<T> = {
  schema: z.ZodType<T>;
  streamUrl: (id: string) => string;
  authHeader: () => Record<string, string>;
  validationLabel: (id: string) => string;
};

const handleWorkflowProgressStreamData = <T>(
  options: StreamOptions<T>,
  id: string,
  data: string,
  onSnapshot: (snapshot: T) => void,
) => {
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

export const createWorkflowProgressStreamer = <T>(options: StreamOptions<T>) => async (
  id: string,
  onSnapshot: (snapshot: T) => void,
  signal?: AbortSignal,
  onHeartbeat?: () => void,
) => {
  const headers = options.authHeader();
  if (typeof EventSource !== 'undefined' && Object.keys(headers).length === 0) {
    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(options.streamUrl(id));
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        source.close();
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish();
      source.addEventListener('snapshot', (event) => {
        handleWorkflowProgressStreamData(options, id, event.data, onSnapshot);
      });
      source.addEventListener('run.snapshot', (event) => {
        handleWorkflowProgressStreamData(options, id, event.data, onSnapshot);
      });
      source.addEventListener('run.completed', (event) => {
        handleWorkflowProgressStreamData(options, id, event.data, onSnapshot);
        finish();
      });
      source.addEventListener('heartbeat', () => {
        onHeartbeat?.();
      });
      source.onerror = () => {
        if (signal?.aborted) finish();
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    return;
  }

  let lastEventId = '';
  let reconnectDelayMs = 250;
  while (!signal?.aborted) {
    try {
      const response = await fetch(options.streamUrl(id), {
        headers: lastEventId ? { ...headers, 'Last-Event-ID': lastEventId } : headers,
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`workflow progress stream failed: ${response.status}`);
      }
      const reader = response.body.getReader();
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
          handleWorkflowProgressStreamData(options, id, data, onSnapshot);
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
    }
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, reconnectDelayMs);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 5_000);
  }
};
