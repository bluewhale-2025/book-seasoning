import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "../../lib/utils";

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn("grid gap-3", className)} {...props} />;
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "size-5 shrink-0 rounded-full border border-border-strong bg-surface-elevated outline-none transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-foreground disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="grid size-full place-items-center">
        <span className="size-2.5 rounded-full bg-accent" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
