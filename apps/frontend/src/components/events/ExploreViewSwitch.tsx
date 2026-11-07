'use client';

export type ExploreView = 'list' | 'split' | 'map';

export function ExploreViewSwitch({
  view,
  onChange,
  splitAvailable,
}: {
  view: ExploreView;
  onChange: (view: ExploreView) => void;
  splitAvailable: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Event display"
      className="inline-flex rounded-lg border border-neutral-200 bg-white p-1"
    >
      {(['list', 'split', 'map'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={option === 'split' && !splitAvailable}
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm capitalize pointer-coarse:min-h-11 disabled:hidden ${view === option ? 'bg-[var(--accent)] font-semibold text-[var(--accent-ink)]' : 'text-neutral-600 hover:bg-neutral-100'}`}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            {option === 'list' && <path d="M2 3.5h12M2 8h12M2 12.5h12" />}
            {option === 'split' && (
              <>
                <rect x="2" y="2.5" width="12" height="11" rx="1" />
                <path d="M7 3v10" />
              </>
            )}
            {option === 'map' && (
              <>
                <path d="M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2z" />
                <path d="M6 2v10M10 4v10" />
              </>
            )}
          </svg>
          {option}
        </button>
      ))}
    </div>
  );
}
