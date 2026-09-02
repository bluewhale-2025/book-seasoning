import * as React from "react";

import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-lg border border-border-strong bg-surface-elevated px-3 py-2.5 text-[16px] leading-7 text-foreground outline-none transition-colors duration-[var(--motion-fast)] placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
