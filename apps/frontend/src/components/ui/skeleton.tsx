import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-md bg-neutral-200 motion-reduce:animate-none',
        className,
      )}
    />
  );
}
