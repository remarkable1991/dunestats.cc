import { colorHex, type TelemetryPlayer } from "@/lib/match-telemetry";

/** Stylised sandworm token used for the first-player marker. */
export function WurmToken({
  size = 26,
  muted = false,
  unknown = false,
}: {
  size?: number;
  muted?: boolean;
  unknown?: boolean;
}) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full border transition-all duration-300"
      style={{
        width: size,
        height: size,
        borderColor: muted ? "rgba(255,255,255,0.15)" : "#d9943b",
        background: muted
          ? "transparent"
          : "radial-gradient(circle at 35% 30%, #f0c07a, #b87333 70%)",
        boxShadow: muted ? "none" : "0 0 10px rgba(217,148,59,0.5)",
      }}
      title={unknown ? "First player unknown" : "First player"}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} aria-hidden>
        <path
          d="M4 19c0-6 3-9 6-9s5 2 5 5 2 4 4 4"
          fill="none"
          stroke={muted ? "rgba(255,255,255,0.35)" : "#3a2410"}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="19" cy="8" r="3" fill={muted ? "rgba(255,255,255,0.25)" : "#3a2410"} />
      </svg>
      {unknown && (
        <span className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
          ?
        </span>
      )}
    </span>
  );
}

/** A single upright agent meeple silhouette. */
export function AgentMeeple({
  hex,
  faded = false,
  size = 16,
  className = "",
}: {
  hex: string;
  faded?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 12 20"
      width={size}
      height={size * 1.5}
      className={`transition-all duration-300 ${className}`}
      style={{ opacity: faded ? 0.25 : 1 }}
      aria-hidden
    >
      <circle cx="6" cy="4" r="3.2" fill={hex} />
      <path d="M6 7.5c3 0 4.6 3.2 4.6 8.5H1.4C1.4 10.7 3 7.5 6 7.5Z" fill={hex} />
    </svg>
  );
}

export function ResourceBadges({ p }: { p: TelemetryPlayer }) {
  const items: Array<[string, string, number | null]> = [
    ["🟠", "Spice", p.spice],
    ["⚪", "Solaris", p.solaris],
    ["💧", "Water", p.water],
  ];
  const shown = items.filter(([, , v]) => v !== null && v !== undefined);
  if (!shown.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
      {shown.map(([icon, label, v]) => (
        <span
          key={label}
          title={label}
          className="inline-flex items-center gap-1 rounded border border-border/40 bg-background/50 px-1.5 py-0.5"
        >
          <span aria-hidden>{icon}</span>
          {v}
        </span>
      ))}
    </div>
  );
}

/** Agent row: 3 meeples when the swordmaster is recruited, 2 otherwise. */
export function AgentRow({
  p,
  canEdit,
  onToggleSwordmaster,
}: {
  p: TelemetryPlayer;
  canEdit: boolean;
  onToggleSwordmaster: () => void;
}) {
  const hex = colorHex(p.player_color);
  const has = p.has_swordmaster;
  return (
    <div className="flex items-end gap-1">
      <AgentMeeple hex={hex} />
      <AgentMeeple hex={hex} />
      <button
        type="button"
        disabled={!canEdit}
        onClick={onToggleSwordmaster}
        title={
          has === true
            ? "Swordmaster recruited — click to remove"
            : has === false
              ? "No Swordmaster — click to recruit"
              : "Swordmaster unknown — click to recruit"
        }
        className={`relative inline-flex items-end rounded transition-all duration-300 ${
          canEdit ? "cursor-pointer hover:bg-sand/10" : "cursor-default"
        }`}
      >
        {has === true ? (
          <AgentMeeple hex={hex} className="scale-100" />
        ) : (
          <span className="inline-flex items-end opacity-60">
            <AgentMeeple hex={hex} faded />
            {has === null && (
              <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
                ?
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

/** High Council — four seats left to right, mapped by turn order. */
export function HighCouncilSeats({
  players,
  canEdit,
  onToggleSeat,
}: {
  players: TelemetryPlayer[];
  canEdit: boolean;
  onToggleSeat: (seat: number) => void;
}) {
  return (
    <div>
      <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground mb-2">
        High Council
      </h3>
      <div className="flex items-center gap-3">
        {[1, 2, 3, 4].map((seat) => {
          const occupant = players.find((p) => (p.turn_order ?? 0) === seat && p.has_high_council);
          const candidate = players.find((p) => (p.turn_order ?? 0) === seat);
          const hex = occupant ? colorHex(occupant.player_color) : null;
          return (
            <button
              key={seat}
              type="button"
              disabled={!canEdit || !candidate}
              onClick={() => onToggleSeat(seat)}
              title={
                occupant
                  ? `Seat ${seat} — ${occupant.player_name}`
                  : candidate
                    ? `Seat ${seat} — empty (${candidate.player_name})`
                    : `Seat ${seat} — empty`
              }
              className={`relative size-10 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                canEdit && candidate ? "cursor-pointer hover:scale-105" : "cursor-default"
              }`}
              style={
                hex
                  ? { borderColor: hex, background: hex, boxShadow: `0 0 12px ${hex}88` }
                  : { borderColor: "rgba(255,255,255,0.18)", background: "#0c0f14" }
              }
            >
              <span
                className="text-[10px] font-display"
                style={{ color: hex ? "#0b0b0b" : "rgba(255,255,255,0.35)" }}
              >
                {seat}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Swordmaster board space — holds the meeples of players who have not recruited. */
export function SwordmasterSpace({
  players,
  canEdit,
  onToggleSwordmaster,
}: {
  players: TelemetryPlayer[];
  canEdit: boolean;
  onToggleSwordmaster: (name: string) => void;
}) {
  const unrecruited = players.filter((p) => p.has_swordmaster !== true);
  return (
    <div>
      <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground mb-2">
        Swordmaster space
      </h3>
      <div className="min-h-[3.25rem] rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 flex items-end gap-3">
        {unrecruited.length === 0 ? (
          <span className="text-[11px] text-muted-foreground self-center">
            All swordmasters recruited
          </span>
        ) : (
          unrecruited.map((p) => (
            <button
              key={p.player_name}
              type="button"
              disabled={!canEdit}
              onClick={() => onToggleSwordmaster(p.player_name)}
              title={`${p.player_name} — ${p.has_swordmaster === null ? "unknown" : "not recruited"}`}
              className={`relative flex flex-col items-center gap-0.5 transition-all duration-300 ${
                canEdit ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
              }`}
            >
              <AgentMeeple
                hex={p.has_swordmaster === null ? "#8b8b8b" : colorHex(p.player_color)}
                size={14}
              />
              {p.has_swordmaster === null && (
                <span className="absolute -top-1 -right-2 size-3.5 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
                  ?
                </span>
              )}
              <span className="text-[9px] text-muted-foreground max-w-[4.5rem] truncate">
                {p.player_name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
