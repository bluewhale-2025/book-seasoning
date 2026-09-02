import * as React from "react";

import { cn } from "../../lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-md border border-border-strong bg-surface-elevated px-3 text-[16px] leading-6 text-foreground shadow-none outline-none transition-colors duration-[var(--motion-fast)] placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60 md:text-[14px]",
        className,
      )}
      {...props}
    />
  );
}
