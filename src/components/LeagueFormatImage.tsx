import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FormatImage } from "@/components/FormatImage";

/** Shows the League preset artwork that was active when the lobby was created (or now). */
export function LeagueFormatImage({ at }: { at?: string | null }) {
  const [preset, setPreset] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    const iso = at ?? new Date().toISOString();
    void supabase
      .from("league_presets")
      .select("name,url,start_date")
      .lte("start_date", iso)
      .gt("end_date", iso)
      .order("start_date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const p = data?.[0];
        setPreset(p?.url ? { name: p.name, url: p.url } : null);
      });
  }, [at]);
  if (!preset) return null;
  return <FormatImage url={preset.url} label={`${preset.name} format`} />;
}
