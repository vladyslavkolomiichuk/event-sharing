import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent)] text-[#42240e] hover:bg-[#f8b580]',
        outline:
          'border border-neutral-300 bg-white text-black hover:bg-neutral-100',
        ghost: 'text-black hover:bg-neutral-100',
        destructive: 'bg-neutral-800 text-white hover:bg-black',
      },
      size: { default: 'h-10 px-4 py-2', sm: 'h-8 px-3', lg: 'h-11 px-6' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
