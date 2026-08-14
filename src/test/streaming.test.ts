import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createWorkflowProgressStreamer } from '../api/streaming';

const response = (body: string) => ({
  ok: true,
  status: 200,
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }),
}) as Response;

describe('authenticated SSE streaming', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects with Last-Event-ID and stops cleanly on abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('id: 7\nevent: run.snapshot\ndata: {"data":{"status":"running"}}\n\n'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return response('');
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', undefined);
    const snapshots: Array<{ status: string }> = [];
    const stream = createWorkflowProgressStreamer({
      schema: z.object({ status: z.string() }),
      streamUrl: (id) => `/api/v1/runs/${id}/events/stream`,
      authHeader: () => ({ Authorization: 'Bearer local' }),
      validationLabel: () => 'run stream',
    });

    const task = stream('run-1', (snapshot) => snapshots.push(snapshot), controller.signal);
    await vi.advanceTimersByTimeAsync(250);
    await task;

    expect(snapshots).toEqual([{ status: 'running' }]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/runs/run-1/events/stream', expect.objectContaining({
      headers: { Authorization: 'Bearer local', 'Last-Event-ID': '7' },
    }));
  });

  it('stops reconnecting after a terminal event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(
      'id: 8\nevent: run.completed\ndata: {"data":{"status":"completed"}}\n\n',
    ));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', undefined);
    const snapshots: Array<{ status: string }> = [];
    const stream = createWorkflowProgressStreamer({
      schema: z.object({ status: z.string() }),
      streamUrl: (id) => `/api/v1/runs/${id}/events/stream`,
      authHeader: () => ({ Authorization: 'Bearer local' }),
      validationLabel: () => 'run stream',
    });

    await stream('run-1', (snapshot) => snapshots.push(snapshot));

    expect(snapshots).toEqual([{ status: 'completed' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
