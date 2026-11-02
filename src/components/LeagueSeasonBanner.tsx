import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Season = { id: number; name: string; starts_at: string; ends_at: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Shows the League season (current by default, or a given season id) with start, end and time left. */
export function LeagueSeasonBanner({ seasonId, className = "" }: { seasonId?: number | null; className?: string }) {
  const [season, setSeason] = useState<Season | null>(null);

  useEffect(() => {
    let active = true;
    const iso = new Date().toISOString();
    const q = supabase.from("sp_seasons").select("id,name,starts_at,ends_at");
    const req = seasonId != null ? q.eq("id", seasonId).maybeSingle() : q.lte("starts_at", iso).gt("ends_at", iso).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    void req.then(({ data }) => { if (active) setSeason((data as Season) ?? null); });
    return () => { active = false; };
  }, [seasonId]);

  if (!season) return null;
  const end = new Date(season.ends_at).getTime();
  const ms = end - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const left = ms <= 0 ? "Ended" : days >= 1 ? `${days} day${days === 1 ? "" : "s"} left` : `${Math.max(1, Math.floor(ms / 3_600_000))} h left`;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm ${className}`}>
      <CalendarDays className="size-4 text-primary" />
      <span className="font-medium">League {season.name}</span>
      <span className="text-muted-foreground">{fmt(season.starts_at)} → {fmt(season.ends_at)}</span>
      <span className="ml-auto font-medium text-primary">{left}</span>
    </div>
  );
}
