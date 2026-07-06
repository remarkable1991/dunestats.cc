import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deleteGame } from "@/lib/games.functions";
import { toast } from "sonner";
import { ListOrdered, Search, Trash2, Loader2, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { ScreenshotButton } from "@/components/ScreenshotButton";
import { EloDeltaLine, TournamentTag } from "@/components/EloDelta";

export const Route = createFileRoute("/matches")({
  head: () => ({ meta: [{ title: "Matches · Strategy Arena" }] }),
  component: MatchesPage,
});

type ResultRow = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
  elo_delta: number | null;
  elo_delta_overall: number | null;
};
type GameRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  game_version: "base" | "ix" | "uprising";
  board_version: string | null;
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
  has_base_leaders: boolean;
  image_url: string | null;
  tournament_num: number | null;
  game_results: ResultRow[];
};

const VERSIONS: Array<{ k: "all" | "base" | "ix" | "uprising"; label: string }> = [
  { k: "all", label: "All" },
  { k: "base", label: "Base" },
  { k: "ix", label: "Rise of Ix" },
  { k: "uprising", label: "Uprising" },
];

const PAGE_SIZE = 20;

function MatchesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [games, setGames] = useState<GameRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState<(typeof VERSIONS)[number]["k"]>("all");
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
      }
    });
  }, []);

  useEffect(() => {
    setPage(0);
  }, [version, q, onlyMine]);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("games")
      .select(
        "id, created_at, created_by, game_version, board_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, image_url, tournament_num, game_results(placement, player_name, leader_name, points, elo_delta, elo_delta_overall)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (version !== "all") query = query.eq("game_version", version);
    if (onlyMine && userId) query = query.eq("created_by", userId);
    query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count } = await query;
    let rows = (data as GameRow[]) ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((g) =>
        g.game_results.some(
          (r) =>
            r.player_name.toLowerCase().includes(needle) ||
            (r.leader_name ?? "").toLowerCase().includes(needle),
        ),
      );
    }
    setGames(rows);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, q, onlyMine, page, userId]);

  const filtered = games;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this match? ELO and stats it contributed will be reverted.")) return;
    setBusy(id);
    try {
      await deleteGame({ data: { game_id: id } });
      toast.success("Match deleted and ratings reverted.");
      setGames((gs) => gs.filter((g) => g.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete match.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <ListOrdered className="size-7 text-sand" />
          <h1 className="font-display text-3xl">Recorded matches</h1>
          {isAdmin && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-coral border border-coral/40 rounded px-2 py-0.5">
              <Shield className="size-3" /> Admin
            </span>
          )}
        </div>
        <p className="text-muted-foreground mb-6">
          Every uploaded match. You can delete your own uploads; admins can delete any match.
        </p>

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <div className="flex bg-card/60 border border-border/60 rounded-md p-1">
            {VERSIONS.map((v) => (
              <button
                key={v.k}
                onClick={() => setVersion(v.k)}
                className={`px-3 py-1 text-sm rounded ${
                  version === v.k ? "bg-sand text-sand-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search player or leader…"
              className="pl-8 w-64"
            />
          </div>
          {userId && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground ml-2">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only my uploads
            </label>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} matches</span>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading matches…</p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((g) => {
              const canDelete = isAdmin || (userId && g.created_by === userId);
              const sorted = [...g.game_results].sort((a, b) => a.placement - b.placement);
              const tags: string[] = [];
              if (g.board_version) tags.push(g.board_version === "uprising" ? "Uprising" : "Base");
              if (g.has_rise_of_ix) tags.push("Rise of Ix");
              if (g.has_epic_mode) tags.push("Epic");
              if (g.has_immortality) tags.push("Immortality");
              if (g.has_base_leaders) tags.push("Base Leaders");
              return (
                <Card key={g.id} className="p-4 border-border/60 bg-card/70">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <TournamentTag num={g.tournament_num} />
                      {tags.map((t) => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
                          {t}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {new Date(g.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {g.image_url && <ScreenshotButton url={g.image_url} />}
                      {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(g.id)}
                        disabled={busy === g.id}
                      >
                        {busy === g.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4 text-coral" />
                        )}
                      </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {sorted.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between border border-border/40 rounded px-3 py-2 bg-background/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex size-6 items-center justify-center rounded bg-secondary/60 text-xs font-bold">
                            {r.placement}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to="/players/$key"
                              params={{ key: r.player_name.toLowerCase().trim() }}
                              className="block truncate font-medium hover:text-sand"
                            >
                              {r.player_name}
                            </Link>
                            <div className="text-xs text-muted-foreground truncate">{r.leader_name}</div>
                            <EloDeltaLine version={g.game_version} overall={r.elo_delta_overall} versionDelta={r.elo_delta} />
                          </div>
                        </div>
                        <span className="font-display text-sand tabular-nums">{r.points}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-10">No matches found.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {total} total matches{onlyMine ? " (yours)" : ""}
            {version !== "all" ? ` · ${VERSIONS.find((v) => v.k === version)?.label}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">Page {page + 1} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}