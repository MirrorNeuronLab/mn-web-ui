import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePaginatedPolling } from '../hooks/usePaginatedPolling';
import type { Page } from '../api/parsing';

type Row = { id: string; status: string };
const identify = (row: Row) => row.id;
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('paginated inventory polling', () => {
  afterEach(() => vi.useRealTimers());

  it('refreshes expanded pages and preserves the final cursor and current row states', async () => {
    vi.useFakeTimers();
    let status = 'running';
    const load = vi.fn(async (token?: string): Promise<Page<Row>> => {
      const index = Number(token || '0');
      return { items: [{ id: `row-${index}`, status }], next_page_token: index < 3 ? String(index + 1) : null };
    });
    const { result } = renderHook(() => usePaginatedPolling(load, identify, 'Inventory unavailable.'));
    await tick();
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(result.current.nextPageToken).toBe('3');
    status = 'completed';
    await tick(5000);
    expect(result.current.items).toEqual([0, 1, 2].map(index => ({ id: `row-${index}`, status: 'completed' })));
    expect(result.current.nextPageToken).toBe('3');
    await act(() => result.current.loadMore());
    expect(result.current.items).toHaveLength(4);
    expect(result.current.nextPageToken).toBeNull();
  });

  it('ignores a pending load-more response after the filter changes', async () => {
    vi.useFakeTimers();
    let finish: (page: Page<Row>) => void = () => {};
    const original = vi.fn(async (token?: string): Promise<Page<Row>> => token
      ? new Promise(resolve => { finish = resolve; })
      : { items: [{ id: 'old', status: 'running' }], next_page_token: 'next' });
    const filtered = vi.fn(async (): Promise<Page<Row>> => ({ items: [{ id: 'new', status: 'running' }], next_page_token: null }));
    const { result, rerender } = renderHook(({ load }) => usePaginatedPolling(load, identify, 'Inventory unavailable.'), { initialProps: { load: original } });
    await tick();
    let pending: Promise<void>;
    act(() => { pending = result.current.loadMore(); });
    rerender({ load: filtered });
    await tick();
    await act(async () => { finish({ items: [{ id: 'stale', status: 'running' }], next_page_token: null }); await pending; });
    expect(result.current.items.map(row => row.id)).toEqual(['new']);
    expect(result.current.loadingMore).toBe(false);
  });

  it('keeps the last complete window and shows an error if a later page fails', async () => {
    vi.useFakeTimers();
    let fail = false;
    const load = vi.fn(async (token?: string): Promise<Page<Row>> => {
      if (token && fail) throw new Error('Second page unavailable');
      return { items: [{ id: token ? 'tail' : 'first', status: 'running' }], next_page_token: token ? null : 'next' };
    });
    const { result } = renderHook(() => usePaginatedPolling(load, identify, 'Inventory unavailable.'));
    await tick();
    await act(() => result.current.loadMore());
    fail = true;
    await tick(5000);
    expect(result.current.items.map(row => row.id)).toEqual(['first', 'tail']);
    expect(result.current.error).toBe('Second page unavailable');
  });
});
