'use client';

import { useEffect, useState } from 'react';
import { usersClient, type UserSearchResult } from '@/lib/api/UsersClient';
import { Input } from '@/components/ui/input';

export function OrganizerFilter({
  query,
  selectedId,
  onQueryChange,
  onSelect,
}: {
  query: string;
  selectedId: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string, label: string) => void;
}) {
  const [matches, setMatches] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const term = query.trim().replace(/^@/, '');

  useEffect(() => {
    if (selectedId || term.length < 2) {
      setMatches([]);
      setLoading(false);
      setError(false);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setMatches([]);
    setSearched(false);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const page = await usersClient.searchByUsername(term);
        if (!cancelled) {
          setMatches(page.items);
          setSearched(true);
        }
      } catch {
        if (!cancelled) {
          setMatches([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, selectedId]);

  return (
    <div className="relative min-w-0">
      <label htmlFor="explore-organizer">Organizer</label>
      <div className="flex gap-1">
        <div className="min-w-0 flex-1">
          <Input
            id="explore-organizer"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Find by @username"
            maxLength={31}
            aria-describedby="explore-organizer-help"
          />
        </div>
        {query && (
          <button
            type="button"
            className="rounded-md px-2 text-xs text-orange-800 hover:bg-orange-50"
            onClick={() => onQueryChange('')}
            aria-label="Clear organizer filter"
          >
            Clear
          </button>
        )}
      </div>
      <p id="explore-organizer-help" className="mt-1 text-xs text-neutral-500">
        {selectedId
          ? 'Showing events by this organizer.'
          : loading
            ? 'Searching people…'
            : error
              ? 'Could not search people. Try again.'
              : searched && matches.length === 0
                ? 'No visible people match this username.'
                : 'Select a person from the suggestions.'}
      </p>
      {!selectedId && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-40 max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
          {matches.map((person) => (
            <li key={person.userId}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-700"
                onClick={() => onSelect(person.userId, `@${person.username}`)}
              >
                <span className="font-medium">{person.name}</span>{' '}
                <span className="text-neutral-600">@{person.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
