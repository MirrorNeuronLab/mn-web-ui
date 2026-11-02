import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RuntimeSignalsPanel } from '../components/RuntimeSignalsPanel';
import { mergeRuntimeSignal, streamRuntimeSignals, type RuntimeSignal } from '../api/runtimeSignals';

const event = (sequence: number, state = 'observed'): RuntimeSignal => ({
  schema: 'mn.runtime.event.v1', event_id: `event-${sequence}`, type: `runtime.error_${state}`,
  channel: 'errors', sequence, observed_ms: 1,
  payload: { incident_id: 'incident', state, count: 1, error: { code: 'runner_failed', desc: 'Runner stopped' } },
});
const frame = (value: RuntimeSignal) => `id: ${value.sequence}\nevent: runtime.signal\ndata: ${JSON.stringify(value)}\n\n`;
const response = (body: string) => ({ ok: true, status: 200, body: new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(body)); controller.close();
} }) });

describe('protected runtime signals', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('coalesces recovery without allowing duplicates or old events to replace it', () => {
    const observed = mergeRuntimeSignal([], event(1));
    const recovered = mergeRuntimeSignal(observed, event(2, 'recovered'));
    expect(recovered).toHaveLength(1);
    expect(mergeRuntimeSignal(recovered, event(1))).toBe(recovered);
    expect(recovered[0].payload.state).toBe('recovered');
  });

  it('keeps observing after an operation error and preserves durable event identities', async () => {
    const controller = new AbortController();
    const received: RuntimeSignal[] = [];
    const fetcher = vi.fn().mockResolvedValue(response(frame(event(7)) + frame(event(7)) + frame(event(8, 'recovered'))));
    vi.stubGlobal('fetch', fetcher);
    await streamRuntimeSignals('/signals?channel=errors', { Authorization: 'Bearer test' }, controller.signal,
      incoming => { received.push(incoming); if (incoming.sequence === 8) controller.abort(); }, vi.fn());
    expect(received.map(item => item.event_id)).toEqual(['event-7', 'event-8']);
    expect(fetcher.mock.calls[0][1].headers['Authorization']).toBe('Bearer test');
  });

  it('reconnects with the last delivered cursor and surfaces a replay gap', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const received: RuntimeSignal[] = [];
    const available = vi.fn();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(frame(event(7))))
      .mockResolvedValueOnce(response('event: stream.unavailable\ndata: {"code":"replay_required"}\n\n'))
      .mockResolvedValueOnce(response(frame(event(9, 'recovered'))));
    vi.stubGlobal('fetch', fetcher);
    const pending = streamRuntimeSignals('/signals', {}, controller.signal,
      incoming => { received.push(incoming); if (incoming.sequence === 9) controller.abort(); }, available);
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    expect(fetcher.mock.calls[1][1].headers['Last-Event-ID']).toBe('7');
    expect(fetcher.mock.calls[2][1].headers['Last-Event-ID']).toBe('0');
    expect(available).toHaveBeenCalledWith('Signal replay gap; resynchronizing.');
  });

  it('presents recovery separately from a disconnected transport', () => {
    const { rerender } = render(<RuntimeSignalsPanel events={[event(1)]} />);
    expect(screen.getByText('Failure detected')).toBeInTheDocument();
    rerender(<RuntimeSignalsPanel events={[event(2, 'recovered')]} unavailable="Signal connection interrupted." />);
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.getByText(/Operation status is unchanged/)).toBeInTheDocument();
  });
});
