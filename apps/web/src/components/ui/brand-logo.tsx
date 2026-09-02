import type * as React from "react";

import { cn } from "../../lib/utils";

export type BrandLogoProps = React.ComponentProps<"span"> & {
  showWordmark?: boolean;
};

export function BrandLogo({
  className,
  showWordmark = true,
  ...props
}: BrandLogoProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-foreground", className)}
      aria-label="책은양념"
      {...props}
    >
      <svg
        aria-hidden="true"
        className="size-8 shrink-0"
        viewBox="0 0 64 64"
        fill="none"
      >
        <circle cx="32" cy="9" r="5" fill="var(--accent)" />
        <path
          d="M17 21h30M19 31l13 16 13-16"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className="whitespace-nowrap text-[17px] leading-5 font-bold tracking-[-0.05em]">
          책은양념
        </span>
      )}
    </span>
  );
}
