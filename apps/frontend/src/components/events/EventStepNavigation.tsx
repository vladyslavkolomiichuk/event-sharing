export const EVENT_FORM_STEPS = [
  'Event details',
  'Location',
  'Invitations (optional)',
  'Review',
] as const;

export function EventStepNavigation({
  current,
  reached,
  onSelect,
}: {
  current: number;
  reached: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav
      aria-label="Event form steps"
      className="lg:sticky lg:top-5 lg:self-start"
    >
      <ol className="flex gap-2 overflow-x-auto text-sm lg:flex-col">
        {EVENT_FORM_STEPS.map((label, index) => (
          <li key={label} className="shrink-0">
            <button
              type="button"
              disabled={index > reached}
              aria-current={index === current ? 'step' : undefined}
              onClick={() => onSelect(index)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:text-neutral-400 ${index === current ? 'bg-neutral-100 font-semibold text-black' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-neutral-300 text-xs">
                {index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
