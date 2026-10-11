import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '../api/parsing';
import { usePollingEffect } from './usePollingEffect';
import { apiErrorMessage } from '../utils/apiErrors';

/** Refresh the entire expanded window, keeping its cursor and row states current. */
export function usePaginatedPolling<T>(
  loadPage: (token?: string) => Promise<Page<T>>,
  identify: (item: T) => string,
  errorMessage: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pages = useRef(1);
  const requestVersion = useRef(0);
  const currentPage = useRef<Page<T>>({ items: [], next_page_token: null });

  useEffect(() => () => { requestVersion.current += 1; }, [loadPage]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    const fresh: T[] = [];
    const tokens = new Set<string>();
    let token: string | undefined;
    let count = 0;
    try {
      do {
        const page = await loadPage(token);
        if (signal?.aborted || version !== requestVersion.current) return;
        fresh.push(...page.items);
        count += 1;
        token = page.next_page_token || undefined;
        if (token && tokens.has(token)) throw new Error('The API returned a repeated page cursor.');
        if (token) tokens.add(token);
      } while (token && count < pages.current);
      const unique = [...new Map(fresh.map(item => [identify(item), item])).values()];
      pages.current = count;
      currentPage.current = { items: unique, next_page_token: token || null };
      setItems(unique);
      setNextPageToken(token || null);
      setError('');
    } catch (err) {
      if (signal?.aborted || version !== requestVersion.current) return;
      setError(apiErrorMessage(err, errorMessage));
      throw err;
    } finally {
      if (!signal?.aborted && version === requestVersion.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [loadPage, identify, errorMessage]);

  const reset = useCallback(() => {
    pages.current = 1;
    currentPage.current = { items: [], next_page_token: null };
    setLoading(true);
    setLoadingMore(false);
    setItems([]);
    setNextPageToken(null);
    setError('');
  }, []);

  usePollingEffect(refresh, { intervalMs: 5000, onInitialPoll: reset });

  const loadMore = async () => {
    const previous = currentPage.current;
    if (!previous.next_page_token || loadingMore) return;
    if (pages.current >= 100) {
      setError('The list is too large to load further. Narrow the filter.');
      return;
    }
    setLoadingMore(true);
    const version = ++requestVersion.current;
    // An overlapping poll must refresh this newly requested page as well.
    pages.current += 1;
    try {
      const page = await loadPage(previous.next_page_token);
      if (version !== requestVersion.current) return;
      if (page.next_page_token === previous.next_page_token) throw new Error('The API returned a repeated page cursor.');
      const merged = [...new Map([...previous.items, ...page.items].map(item => [identify(item), item])).values()];
      currentPage.current = { items: merged, next_page_token: page.next_page_token };
      setItems(merged);
      setNextPageToken(page.next_page_token);
      setError('');
    } catch (err) {
      if (version !== requestVersion.current) return;
      pages.current -= 1;
      setError(apiErrorMessage(err, errorMessage));
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  };

  return { items, loading, loadingMore, nextPageToken, error, refresh, loadMore };
}
