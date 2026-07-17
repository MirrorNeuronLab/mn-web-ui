import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePollingEffect } from '../hooks/usePollingEffect';

function PollingProbe({
  enabled = true,
  onInitialPoll,
  onPoll,
}: {
  enabled?: boolean;
  onInitialPoll?: () => void;
  onPoll: () => void | Promise<void>;
}) {
  usePollingEffect(onPoll, { intervalMs: 1000, enabled, onInitialPoll });
  return null;
}

describe('usePollingEffect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs after the initial delay, then on the interval, and cleans up timers', async () => {
    vi.useFakeTimers();
    const onPoll = vi.fn();
    const onInitialPoll = vi.fn();

    const { unmount } = render(<PollingProbe onInitialPoll={onInitialPoll} onPoll={onPoll} />);

    expect(onPoll).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onInitialPoll).toHaveBeenCalledOnce();
    expect(onPoll).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it('does not overlap polls when a request takes longer than the interval', async () => {
    vi.useFakeTimers();
    let resolveFirstPoll: (() => void) | undefined;
    const onPoll = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstPoll = resolve;
    }));

    render(<PollingProbe onPoll={onPoll} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onPoll).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onPoll).toHaveBeenCalledOnce();

    await act(async () => {
      resolveFirstPoll?.();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it('does not schedule polling when disabled', () => {
    vi.useFakeTimers();
    const onPoll = vi.fn();

    render(<PollingProbe enabled={false} onPoll={onPoll} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onPoll).not.toHaveBeenCalled();
  });
});
