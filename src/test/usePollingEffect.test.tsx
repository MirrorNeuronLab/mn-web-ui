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
  onPoll: () => void;
}) {
  usePollingEffect(onPoll, { intervalMs: 1000, enabled, onInitialPoll });
  return null;
}

describe('usePollingEffect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs after the initial delay, then on the interval, and cleans up timers', () => {
    vi.useFakeTimers();
    const onPoll = vi.fn();
    const onInitialPoll = vi.fn();

    const { unmount } = render(<PollingProbe onInitialPoll={onInitialPoll} onPoll={onPoll} />);

    expect(onPoll).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onInitialPoll).toHaveBeenCalledOnce();
    expect(onPoll).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
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
