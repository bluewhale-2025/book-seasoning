import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-[18px] font-semibold",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-muted text-foreground",
        accent: "border-topic-border bg-topic-background text-accent-strong",
        outline: "border-border-strong bg-transparent text-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
