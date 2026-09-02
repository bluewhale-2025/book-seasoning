import * as React from "react";

import { cn } from "../../lib/utils";

type AIHostInterventionProps = React.ComponentProps<"aside"> & {
  children: React.ReactNode;
};

export function AIHostIntervention({
  children,
  className,
  ...props
}: AIHostInterventionProps) {
  return (
    <aside
      aria-label="책은양념 AI Host의 개입"
      className={cn(
        "animate-ai-intervention mx-auto my-7 w-[calc(100%-1rem)] max-w-[var(--layout-ai-max)] border-y border-ai-host-border bg-ai-host-background px-4 py-3.5",
        className,
      )}
      {...props}
    >
      <div className="text-label mb-1.5 flex items-center gap-2 text-ai-host-marker">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent" />
        책은양념 · AI Host
      </div>
      <div className="text-chat text-foreground">{children}</div>
    </aside>
  );
}
