import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

export type PlayMode = "live" | "async";

/** Admin-configured play modes, keyed by tournament number. */
const PLAY_MODES: Record<number, PlayMode> = {};

/** Register (or update) the play mode of a tournament loaded from the database. */
export function registerPlayMode(num: number | null | undefined, mode: string | null | undefined) {
  if (num == null) return;
  const m = (mode ?? "").toLowerCase();
  if (m === "live" || m === "async") PLAY_MODES[num] = m;
}

/**
 * Play mode per tournament. Uses the admin setting when known, otherwise
 * falls back to history: tournaments 1–15 were async, #16 onward live.
 */
export function tournamentPlayMode(num: number | null | undefined): PlayMode {
  if (num != null && PLAY_MODES[num]) return PLAY_MODES[num]!;
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
