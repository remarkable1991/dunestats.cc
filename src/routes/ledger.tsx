import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { SpLearnMore } from "@/components/SpLearnMore";
import { Sparkles, CheckCircle2, HelpCircle } from "lucide-react";
import { titleColor } from "@/lib/player-title";


export const Route = createFileRoute("/ledger")({
  head: () => ({
    meta: [
      { title: "Strategy Points ledger · Strategy Arena" },
      {
        name: "description",
        content:
          "Seasonal and lifetime Strategy Points (SP) ranking. Separate from Elo — earned by playing, uploading, verifying, and competing in tournaments.",
      },
      { property: "og:title", content: "Strategy Points ledger · Strategy Arena" },
      {
        property: "og:description",
        content:
          "Seasonal and lifetime Strategy Points (SP) ranking, separate from Elo.",
      },
    ],
  }),
  component: LedgerPage,
});

type SpRow = {
  player_key: string;
  display_name: string;
  lifetime_sp: number;
  seasonal_sp: number;
  season_id: number;
  is_claimed: boolean;
};

type Season = { id: number; name: string; starts_at: string; ends_at: string };

function LedgerPage() {
  const [rows, setRows] = useState<SpRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"seasonal" | "lifetime">("seasonal");
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const PAGE = 1000;
      async function fetchAll<T>(build: (from: number, to: number) => Promise<{ data: T[] | null }>): Promise<T[]> {
        const out: T[] = [];
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data } = await build(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          out.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return out;
      }
      const [sp, ss, pr] = await Promise.all([
        fetchAll<SpRow>(async (from, to) => {
          const { data } = await supabase
            .from("player_sp")
            .select("player_key, display_name, lifetime_sp, seasonal_sp, season_id, is_claimed")
            .range(from, to);
          return { data: data as SpRow[] | null };
        }),
        supabase.from("sp_seasons").select("*").order("id").then(({ data }) => data as Season[] | null),
        fetchAll<{ player_key: string; display_name: string }>(async (from, to) => {
          const { data } = await supabase
            .from("player_ratings")
            .select("player_key, display_name")
            .eq("game_version", "overall")
            .range(from, to);
          return { data: data as { player_key: string; display_name: string }[] | null };
        }),
      ]);
      const nameMap = new Map<string, string>();
      for (const r of pr) nameMap.set(r.player_key, r.display_name);
      const merged = sp.map((r) => ({
        ...r,
        display_name: nameMap.get(r.player_key) ?? r.display_name,
      }));
      setRows(merged);
      setSeasons(ss ?? []);
      setLoading(false);
    })();
  }, []);

  const currentSeason = useMemo(() => {
    const now = Date.now();
    return (
      seasons.find((s) => now >= new Date(s.starts_at).getTime() && now < new Date(s.ends_at).getTime()) ??
      seasons[0]
    );
  }, [seasons]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (unclaimedOnly && r.is_claimed) return false;
      if (needle && !r.display_name.toLowerCase().includes(needle)) return false;
      return true;
    });
    const key: keyof SpRow = tab === "seasonal" ? "seasonal_sp" : "lifetime_sp";
    list = [...list].sort((a, b) => (b[key] as number) - (a[key] as number));
    return list;
  }, [rows, q, unclaimedOnly, tab]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Sparkles className="size-7 text-sand" />
          <h1 className="font-display text-3xl">Strategy Points ledger</h1>
          <SpLearnMore className="ml-auto" />
        </div>
        <p className="text-muted-foreground mb-6">
          SP is separate from Elo — it rewards playing, uploading, verifying matches, and competing.
          Uploading a match and verifying it give the <span className="text-foreground">identical</span> reward.
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "seasonal" | "lifetime")}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <TabsList className="bg-card/60 border border-border/60">
              <TabsTrigger value="seasonal" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground">
                Seasonal {currentSeason ? `· ${currentSeason.name}` : ""}
              </TabsTrigger>
              <TabsTrigger value="lifetime" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground">
                Lifetime
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 ml-auto">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search player…"
                className="h-9 w-[180px] bg-card/60 border-border/60"
              />
              <div className="flex items-center gap-2">
                <Switch id="unclaimed" checked={unclaimedOnly} onCheckedChange={setUnclaimedOnly} />
                <Label htmlFor="unclaimed" className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                  Unclaimed accounts
                </Label>
              </div>
            </div>
          </div>

          <TabsContent value="seasonal">
            <div className="mb-3">
              <Badge variant="outline" className="border-sand/60 text-sand bg-sand/10">
                🏆 Seasonal Prizes: TBA Soon!
              </Badge>
            </div>
            <LedgerTable rows={filtered} column="seasonal_sp" loading={loading} />
          </TabsContent>

          <TabsContent value="lifetime">
            <LedgerTable rows={filtered} column="lifetime_sp" loading={loading} />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
          <HelpCircle className="size-3.5" />
          Historical matches before July 1, 2026 count toward Lifetime SP at 10% value. Seasonal totals start fresh.
        </p>
      </div>
    </div>
  );
}

function LedgerTable({
  rows,
  column,
  loading,
}: {
  rows: SpRow[];
  column: "seasonal_sp" | "lifetime_sp";
  loading: boolean;
}) {
  return (
    <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">{column === "seasonal_sp" ? "Seasonal SP" : "Lifetime SP"}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted-foreground">
                  Loading ledger…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted-foreground">
                  No players match this filter.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r, i) => (
                <tr key={r.player_key} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/players/$key"
                      params={{ key: r.player_key }}
                      className="hover:underline underline-offset-2"
                      style={{ color: titleColor(r.lifetime_sp) }}
                      title={`Lifetime: ${r.lifetime_sp.toLocaleString()} SP`}
                    >
                      {r.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {r.is_claimed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 className="size-3.5" /> Claimed
                      </span>
                    ) : (
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Unclaimed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sand font-medium">
                    {(r[column] as number).toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
