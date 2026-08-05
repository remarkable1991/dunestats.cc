import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  text: string | null;
  maxLength?: number;
  className?: string;
};

/** Renders long tournament info text, collapsed after maxLength with a Read more toggle. */
export function TruncatedInfoText({ text, maxLength = 2000, className = "" }: Props) {
  const full = text?.trim();
  const [expanded, setExpanded] = useState(false);
  if (!full) return null;

  const shouldTruncate = full.length > maxLength;
  const display = shouldTruncate && !expanded ? full.slice(0, maxLength) : full;

  return (
    <div className={className}>
      <p className="text-muted-foreground text-sm sm:text-[0.95rem] leading-relaxed whitespace-pre-line">
        {display}
        {shouldTruncate && !expanded && "…"}
      </p>
      {shouldTruncate && (
        <Button
          variant="link"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="h-auto p-0 text-sand"
        >
          {expanded ? "Show less" : "Read more"}
        </Button>
      )}
    </div>
  );
}
