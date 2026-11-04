'use client';

import { useEffect, useRef, useState } from 'react';
import { friendsClient, type FriendSearchPage } from './api/FriendsClient';

export function useFriendSearch(
  query: string,
  sort: 'name' | 'username' = 'name',
  enabled = true,
) {
  const [page, setPage] = useState<FriendSearchPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const currentKey = useRef('');
  currentKey.current = JSON.stringify([query, sort, enabled, revision]);

  useEffect(() => {
    if (!enabled) return;
    const key = currentKey.current;
    setPage(null);
    setError('');
    const timer = setTimeout(() => {
      void friendsClient
        .search(query, sort)
        .then((result) => {
          if (currentKey.current === key) setPage(result);
        })
        .catch((cause: unknown) => {
          if (currentKey.current === key)
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not search friends.',
            );
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, sort, enabled, revision]);

  async function loadMore() {
    if (page?.nextPage == null || loadingMore) return;
    const key = currentKey.current;
    setLoadingMore(true);
    try {
      const next = await friendsClient.search(query, sort, page.nextPage);
      if (currentKey.current === key)
        setPage((current) =>
          current === page
            ? {
                items: [...current.items, ...next.items],
                nextPage: next.nextPage,
              }
            : current,
        );
    } catch (cause) {
      if (currentKey.current === key)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load more friends.',
        );
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    page,
    error,
    loadingMore,
    loadMore,
    refresh: () => setRevision((value) => value + 1),
  };
}
