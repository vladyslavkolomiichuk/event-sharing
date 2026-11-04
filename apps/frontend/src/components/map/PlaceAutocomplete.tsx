'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { placesClient } from '@/lib/api/PlacesClient';
import type { Place, PlaceKind } from '@/lib/places/place.schema';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

export function PlaceAutocomplete({
  id,
  label,
  kind,
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  forceValidation,
  validate,
  context,
}: {
  id: string;
  label: string;
  kind: PlaceKind;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: Place) => void;
  placeholder?: string;
  required?: boolean;
  forceValidation?: boolean;
  validate?: (value: string) => string;
  context?: string;
}) {
  const listId = useId();
  const selectedValue = useRef(value);
  const focused = useRef(false);
  const [items, setItems] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (
      !focused.current ||
      value.trim().length < 2 ||
      value === selectedValue.current
    ) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const searchText =
          kind === 'address' && context?.trim()
            ? `${value.trim()}, ${context.trim()}`
            : value.trim();
        const matches = await placesClient.search(
          searchText.slice(0, 160),
          kind,
          controller.signal,
        );
        setItems(matches);
        setActive(0);
        setOpen(focused.current);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Suggestions unavailable.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, kind, context]);

  function select(place: Place) {
    selectedValue.current = place.label;
    onSelect(place);
    setItems([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        value={value}
        required={required}
        forceValidation={forceValidation}
        validate={validate}
        maxLength={kind === 'city' ? 100 : 300}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        onChange={(event) => {
          selectedValue.current = '';
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          focused.current = true;
          if (items.length) setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && items.length) {
            event.preventDefault();
            setActive((index) => (index + 1) % items.length);
            setOpen(true);
          }
          if (event.key === 'ArrowUp' && items.length) {
            event.preventDefault();
            setActive((index) => (index - 1 + items.length) % items.length);
          }
          if (event.key === 'Enter' && open && items[active]) {
            event.preventDefault();
            select(items[active]);
          }
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {loading && (
        <p className="mt-2 text-xs text-neutral-500">Looking up places…</p>
      )}
      {error && <InlineFeedback message={error} tone="error" />}
      {open && items.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-neutral-300 bg-white p-1 shadow-lg"
        >
          {items.map((place, index) => (
            <button
              key={place.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`block w-full rounded px-3 py-2 text-left text-sm ${index === active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(place)}
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
