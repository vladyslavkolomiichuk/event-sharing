import * as React from 'react';
import { cn } from '@/lib/utils';

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium tabular-nums text-neutral-700',
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
