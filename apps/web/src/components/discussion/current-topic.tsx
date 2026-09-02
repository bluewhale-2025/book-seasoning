import * as React from "react";
import { MessageCircleQuestion } from "lucide-react";

import { cn } from "../../lib/utils";

type CurrentTopicProps = React.ComponentProps<"section"> & {
  topic: string;
  compact?: boolean;
};

export function CurrentTopic({ topic, compact = false, className, ...props }: CurrentTopicProps) {
  return (
    <section
      aria-labelledby="current-topic-label"
      className={cn(
        "relative border-b border-topic-border bg-topic-background px-4 py-3 text-topic-foreground sm:px-5",
        "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:bg-accent",
        compact && "py-2.5",
        className,
      )}
      {...props}
    >
      <div
        id="current-topic-label"
        className="text-label mb-1 flex items-center gap-1.5 text-accent-strong"
      >
        <MessageCircleQuestion aria-hidden="true" className="size-4" />
        현재 이야기
      </div>
      <p className={cn("text-current-topic m-0 break-keep", compact && "line-clamp-2 text-[16px] leading-6")}>
        {topic}
      </p>
    </section>
  );
}
