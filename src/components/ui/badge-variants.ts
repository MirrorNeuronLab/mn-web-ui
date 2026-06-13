import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-neutral-950 text-white',
        secondary: 'border-transparent bg-neutral-100 text-neutral-700',
        outline: 'border-neutral-200 text-neutral-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
        destructive: 'border-red-200 bg-red-50 text-red-700',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
);

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
