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

  it('does not restart polling when only the initial-loading callback changes', async () => {
    vi.useFakeTimers();
    const onPoll = vi.fn();
    const firstInitialPoll = vi.fn();
    const secondInitialPoll = vi.fn();

    const { rerender } = render(
      <PollingProbe onInitialPoll={firstInitialPoll} onPoll={onPoll} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    rerender(<PollingProbe onInitialPoll={secondInitialPoll} onPoll={onPoll} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(firstInitialPoll).toHaveBeenCalledOnce();
    expect(secondInitialPoll).not.toHaveBeenCalled();
    expect(onPoll).toHaveBeenCalledOnce();
  });

  it('reports failures via onError without unhandled rejections and keeps polling', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onPoll = vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(undefined);

    function ErrorProbe() {
      usePollingEffect(onPoll, { intervalMs: 1000, onError, maxDelayMs: 1000 });
      return null;
    }
    render(<ErrorProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onPoll).toHaveBeenCalledTimes(1);

    // Backoff reschedules after the failure; the next poll succeeds and the
    // regular interval resumes without further error reports.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(onPoll).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling after maxConsecutiveFailures', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onPoll = vi.fn().mockRejectedValue(new Error('always failing'));

    function FailingProbe() {
      usePollingEffect(onPoll, { intervalMs: 1000, onError, maxConsecutiveFailures: 2, maxDelayMs: 1000 });
      return null;
    }
    render(<FailingProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
