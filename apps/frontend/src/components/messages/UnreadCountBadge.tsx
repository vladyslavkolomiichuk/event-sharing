export function UnreadCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread messages`}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums text-[var(--accent-ink)]"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
