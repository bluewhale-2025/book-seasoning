import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] leading-[18px] font-semibold transition-colors duration-[var(--motion-fast)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover active:bg-action-primary-hover",
        secondary:
          "border border-border-strong bg-surface-elevated text-foreground hover:bg-surface-muted active:bg-muted",
        ghost: "text-foreground hover:bg-surface-muted active:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-hover",
        link: "h-auto text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[14px]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}

export type IconButtonProps = Omit<ButtonProps, "size" | "aria-label"> & {
  label: string;
};

export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <Button size="icon" aria-label={label} {...props}>
      {children}
    </Button>
  );
}
