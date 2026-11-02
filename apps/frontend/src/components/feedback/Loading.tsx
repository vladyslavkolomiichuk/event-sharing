export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-sm text-neutral-500">
      {label}
    </p>
  );
}
