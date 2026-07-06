import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";

type Version = "base" | "ix" | "uprising";

const SHORT: Record<Version, string> = {
  base: "BA",
  ix: "IX",
  uprising: "UP",
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function toneClass(n: number | null | undefined) {
  if (n === null || n === undefined) return "text-muted-foreground";
  const v = Number(n);
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function EloDeltaLine({
  version,
  overall,
  versionDelta,
  className,
}: {
  version: Version;
  overall: number | null | undefined;
  versionDelta: number | null | undefined;
  className?: string;
}) {
  const o = fmt(overall);
  const v = fmt(versionDelta);
  if (o === null && v === null) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] tabular-nums ${className ?? ""}`}>
      {o !== null && (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-muted-foreground">All</span>
          <span className={toneClass(overall)}>({o})</span>
        </span>
      )}
      {v !== null && (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-muted-foreground">{SHORT[version]}</span>
          <span className={toneClass(versionDelta)}>({v})</span>
        </span>
      )}
    </span>
  );
}

export function TournamentTag({ num, className }: { num: number | null | undefined; className?: string }) {
  if (!num) return null;
  return (
    <Link
      to="/tournament"
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-sand/40 text-sand hover:bg-sand/10 ${className ?? ""}`}
      title={`Tournament ${num}`}
    >
      <Trophy className="size-3" /> Tournament {num}
    </Link>
  );
}