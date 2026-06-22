import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--color-primary)] hover:brightness-110',
        accent:
          'bg-accent text-accent-foreground shadow-[0_0_20px_-4px_var(--color-accent)] hover:brightness-110',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-110',
        secondary: 'bg-secondary text-secondary-foreground hover:brightness-110',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-secondary',
        ghost: 'bg-transparent text-foreground hover:bg-secondary',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-11 px-5',
        lg: 'h-14 px-8 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
