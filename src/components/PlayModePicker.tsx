import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";
import type { PlayMode } from "@/components/TournamentPlayModeBadge";

/** Optional Live / Async toggle. Clicking the active option clears it. */
export function PlayModePicker({
  value,
  onChange,
  disabled,
}: {
  value: PlayMode | null;
  onChange: (m: PlayMode | null) => void;
  disabled?: boolean;
}) {
  const opts: { m: PlayMode; label: string; icon: string; on: string }[] = [
    { m: "live", label: "Live", icon: liveIcon.url, on: "border-teal bg-teal/15 text-teal" },
    { m: "async", label: "Async", icon: asyncIcon.url, on: "border-coral bg-coral/15 text-coral" },
  ];
  return (
    <div className="inline-flex gap-2">
      {opts.map((o) => {
        const active = value === o.m;
        return (
          <button
            key={o.m}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : o.m)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
              active ? o.on : "border-border/60 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <img src={o.icon} alt="" width={16} height={16} className="size-4 object-contain" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
