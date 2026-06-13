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

  const parsed = options.schema.safeParse(payload);
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
) => {
  const response = await fetch(options.streamUrl(id), {
    headers: options.authHeader(),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`workflow progress stream failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const eventName = chunk.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (eventName !== 'snapshot' || !data) continue;
      handleWorkflowProgressStreamData(options, id, data, onSnapshot);
    }
  }
};
