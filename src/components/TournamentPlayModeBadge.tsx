import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

export type PlayMode = "live" | "async";

/**
 * Play mode per tournament. Tournaments 1–15 were played asynchronously;
 * #16 onward are scheduled live matches.
 */
export function tournamentPlayMode(num: number | null | undefined): PlayMode {
  return num != null && num >= 16 ? "live" : "async";
}

/** One-line description of what the format means. */
export function playModeDescription(num: number | null | undefined): string {
  return tournamentPlayMode(num) === "live"
    ? "Real-time matches played at scheduled times."
    : "Turn-based matches played over several days or weeks.";
}

export function TournamentPlayModeBadge({
  num,
  size = 18,
  className = "",
}: {
  num: number | null | undefined;
  size?: number;
  className?: string;
}) {
  const mode = tournamentPlayMode(num);
  const live = mode === "live";
  return (
    <span
      title={playModeDescription(num)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-coral/50 bg-coral/10 text-coral"
      } ${className}`}
    >

      <img
        src={live ? liveIcon.url : asyncIcon.url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="object-contain"
      />
      {live ? "LIVE" : "ASYNC"}
    </span>
  );
}
