import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-28 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-500 focus:border-black disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
