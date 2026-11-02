import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-black outline-none placeholder:text-neutral-500 focus:border-black disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
