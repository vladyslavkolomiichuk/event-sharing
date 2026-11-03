'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-neutral-400 bg-neutral-200 transition-colors data-[state=checked]:border-black data-[state=checked]:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-6" />
    </SwitchPrimitive.Root>
  );
}
