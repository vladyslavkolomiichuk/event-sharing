'use client';

import { useEffect, useState } from 'react';
import { DisplayNameSchema } from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';

export function UsernameSuggestions({
  name,
  onChoose,
}: {
  name: string;
  onChoose: (username: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setSuggestions([]);
    const parsed = DisplayNameSchema.safeParse(name);
    if (!parsed.success) return;
    const timer = window.setTimeout(() => {
      void authClient.usernameSuggestions(parsed.data).then(
        (result) => {
          if (active) setSuggestions(result.suggestions);
        },
        () => {
          if (active) setSuggestions([]);
        },
      );
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [name]);

  if (!suggestions.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-neutral-600">
        Suggestions based on your name. Choose one or type your own.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((username) => (
          <button
            key={username}
            type="button"
            onClick={() => onChoose(username)}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-black focus-visible:outline-2 focus-visible:outline-black"
          >
            @{username}
          </button>
        ))}
      </div>
    </div>
  );
}
