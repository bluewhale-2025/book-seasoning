import * as React from "react";

import { cn } from "../../lib/utils";

type BookCoverProps = React.ComponentProps<"div"> & {
  title: string;
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-11 w-8 rounded-[3px] text-[8px] leading-[11px]",
  md: "h-14 w-10 rounded-[4px] text-[9px] leading-3",
  lg: "h-24 w-[68px] rounded-[5px] text-[11px] leading-[15px]",
};

export function BookCover({
  title,
  src,
  alt,
  size = "md",
  className,
  ...props
}: BookCoverProps) {
  const accessibleAlt = alt ?? `${title} 표지`;

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-[#765641] px-1 text-center font-semibold break-keep text-[#fffaf5] shadow-[0_1px_2px_rgb(34_28_22_/_0.16)]",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <img className="size-full object-cover" src={src} alt={accessibleAlt} />
      ) : (
        <span aria-label={accessibleAlt}>{title}</span>
      )}
    </div>
  );
}
