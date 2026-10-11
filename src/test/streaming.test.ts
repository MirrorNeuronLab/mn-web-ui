import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createWorkflowProgressStreamer } from '../api/streaming';
import { WorkflowProgressSchema } from '../api';

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

  it('closes native streams that cannot reconnect instead of waiting forever', async () => {
    const sources: NativeSource[] = [];
    class NativeSource extends EventTarget {
      static CLOSED = 2;
      readyState = 2;
      onerror: (() => void) | null = null;
      close = vi.fn();
      constructor() { super(); sources.push(this); }
    }
    vi.stubGlobal('EventSource', NativeSource);
    const stream = createWorkflowProgressStreamer({ schema: z.object({ status: z.string() }), streamUrl: () => '/stream', authHeader: () => ({}), validationLabel: () => 'Progress' });
    const task = stream('execution-1', vi.fn());
    const source = sources[0];
    const rejected = expect(task).rejects.toThrow('Check the runtime connection and access settings');
    source!.onerror?.();
    await rejected;
    expect(source!.close).toHaveBeenCalledOnce();
  });

  it('retains progress when native EventSource receives a canonical terminal Run', async () => {
    const sources: NativeSource[] = [];
    class NativeSource extends EventTarget {
      static CLOSED = 2;
      readyState = 1;
      onerror: (() => void) | null = null;
      close = vi.fn();
      constructor() { super(); sources.push(this); }
    }
    vi.stubGlobal('EventSource', NativeSource);
    const snapshots: Array<{ job_id: string; steps: Array<{ id: string }>; status: string }> = [];
    const stream = createWorkflowProgressStreamer({ schema: WorkflowProgressSchema, streamUrl: () => '/stream', authHeader: () => ({}), validationLabel: () => 'Progress' });
    const task = stream('execution-1', snapshot => snapshots.push(snapshot));
    const source = sources[0];
    source!.dispatchEvent(new MessageEvent('run.snapshot', { data: JSON.stringify({ data: { job_id: 'execution-1', status: 'running', steps: [{ id: 'review' }] } }), lastEventId: '1' }));
    source!.dispatchEvent(new MessageEvent('run.completed', { data: JSON.stringify({ data: { run_id: 'execution-1', job_id: 'stable-1', status: 'completed' } }), lastEventId: '2' }));
    await task;
    expect(snapshots[1]).toMatchObject({ job_id: 'execution-1', status: 'completed', steps: [{ id: 'review' }] });
    expect(source!.close).toHaveBeenCalledOnce();
  });

  it('preserves public steps when a terminal event carries a Run resource', async () => {
    vi.stubGlobal('EventSource', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
      'id: 1\nevent: run.snapshot\ndata: {"data":{"job_id":"execution-1","status":"running","steps":[{"id":"review","status":"running"}]}}\n\n'
      + 'id: 2\nevent: run.completed\ndata: {"data":{"run_id":"execution-1","job_id":"stable-1","status":"completed"}}\n\n',
    )));
    const snapshots: Array<{ job_id: string; steps: Array<{ id: string }>; status: string }> = [];
    await createWorkflowProgressStreamer({ schema: WorkflowProgressSchema, streamUrl: () => '/stream', authHeader: () => ({ Authorization: 'Bearer test' }), validationLabel: () => 'Progress' })('execution-1', value => snapshots.push(value));
    expect(snapshots[1]).toMatchObject({ job_id: 'execution-1', status: 'completed', steps: [{ id: 'review' }] });
  });

  it('handles CRLF frames and reports run.unavailable without reconnecting', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetchMock = vi.fn().mockResolvedValue(response('id: 1\r\nevent: run.unavailable\r\ndata: {"data":{"status":"unknown"}}\r\n\r\n'));
    vi.stubGlobal('fetch', fetchMock);
    const stream = createWorkflowProgressStreamer({ schema: z.object({ status: z.string() }), streamUrl: () => '/stream', authHeader: () => ({ Authorization: 'Bearer test' }), validationLabel: () => 'Progress' });
    await expect(stream('execution-1', vi.fn())).rejects.toThrow('Runtime control is unavailable');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bounds reconnects when successful HTTP responses immediately end without progress', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetchMock = vi.fn().mockResolvedValue(response(''));
    vi.stubGlobal('fetch', fetchMock);
    const stream = createWorkflowProgressStreamer({ schema: z.object({ status: z.string() }), streamUrl: () => '/stream', authHeader: () => ({}), validationLabel: () => 'Progress', maxReconnectAttempts: 2, maxReconnectDelayMs: 1 });
    await expect(stream('execution-1', vi.fn())).rejects.toThrow('ended before completion');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry rejected authentication', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const stream = createWorkflowProgressStreamer({ schema: z.object({ status: z.string() }), streamUrl: () => '/stream', authHeader: () => ({ Authorization: 'Bearer test' }), validationLabel: () => 'Progress' });
    await expect(stream('execution-1', vi.fn())).rejects.toThrow('HTTP 401');
    expect(fetchMock).toHaveBeenCalledOnce();
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

  it('deduplicates repeated SSE event ids instead of overwriting state twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(
      'id: 9\nevent: run.snapshot\ndata: {"data":{"status":"running"}}\n\n'
      + 'id: 9\nevent: run.snapshot\ndata: {"data":{"status":"running"}}\n\n'
      + 'id: 10\nevent: run.completed\ndata: {"data":{"status":"completed"}}\n\n',
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

    expect(snapshots).toEqual([{ status: 'running' }, { status: 'completed' }]);
  });

  it('bounds reconnects and reports the terminal failure via onError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', undefined);
    const errors: unknown[] = [];
    const stream = createWorkflowProgressStreamer({
      schema: z.object({ status: z.string() }),
      streamUrl: () => '/api/v1/runs/run-1/events/stream',
      authHeader: () => ({ Authorization: 'Bearer local' }),
      validationLabel: () => 'run stream',
      maxReconnectAttempts: 2,
      maxReconnectDelayMs: 1,
      onError: (error) => errors.push(error),
    });

    await expect(stream('run-1', () => {})).rejects.toThrow('boom');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errors.length).toBeGreaterThan(0);
  });
});
