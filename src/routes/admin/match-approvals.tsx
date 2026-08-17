import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";

export const Route = createFileRoute("/admin/match-approvals")({
  head: () => ({
    meta: [
      { title: "Tournament Match Approvals — Strategy Arena" },
      { name: "description", content: "Review uploads flagged as tournament games and correct mis-registered player names." },
      { property: "og:title", content: "Tournament Match Approvals — Strategy Arena" },
      { property: "og:description", content: "Review uploads flagged as tournament games and correct mis-registered player names." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchApprovals,
});

type Unmatched = { detected: string; suggested: string | null };
type DetectedPlayer = { placement: number; player_name: string; leader_name: string | null; points: number };

type Pending = {
  id: string;
  game_id: string | null;
  tournament_num: number;
  round_type: string | null;
  table_identifier: string | null;
  status: string;
  created_at: string;
  detected_players: DetectedPlayer[];
  unmatched: Unmatched[];
  public_match_id?: string | null;
};

type FormState = {
  round: string;
  table: string;
  /** roster name (wrong) -> corrected name */
  fixes: Record<string, string>;
  matchCode: string;
};

function MatchApprovals() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<Pending[]>([]);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("tournament_pending_matches")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const list = ((data ?? []) as unknown as Pending[]).map((r) => ({
      ...r,
      detected_players: (r.detected_players ?? []) as DetectedPlayer[],
      unmatched: (r.unmatched ?? []) as Unmatched[],
    }));
    setRows(list);
    const next: Record<string, FormState> = {};
    for (const r of list) {
      const fixes: Record<string, string> = {};
      for (const u of r.unmatched) {
        // Admin corrects the wrongly registered roster name into the detected name.
        if (u.suggested) fixes[u.suggested] = u.detected;
      }
      next[r.id] = {
        round: r.round_type ?? "",
        table: r.table_identifier ?? "",
        fixes,
        matchCode: "",
      };
    }
    setForms(next);
  };

  useEffect(() => {
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
      }
      await load();
      setLoading(false);
    })();
  }, []);

  const setForm = (id: string, patch: Partial<FormState>) =>
    setForms((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  const approve = async (row: Pending) => {
    const f = forms[row.id];
    if (!f) return;
    setBusy(row.id);
    try {
      const { error } = await supabase.rpc("approve_pending_tournament_match", {
        p_id: row.id,
        p_round: f.round || null,
        p_table: f.table || null,
        p_name_fixes: f.fixes,
        p_match_code: f.matchCode.trim() || null,
      });
      if (error) throw error;
      toast.success("Approved — tournament table updated.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (row: Pending) => {
    setBusy(row.id);
    try {
      const { error } = await supabase.rpc("reject_pending_tournament_match", {
        p_id: row.id,
        p_note: null,
      });
      if (error) throw error;
      toast.success("Submission rejected — the game stays on the global leaderboard.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 flex justify-center">
          <Loader2 className="size-6 animate-spin text-sand" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <Card className="p-6 border-sand/40">
            <h1 className="font-display text-2xl mb-2">Admins only</h1>
            <p className="text-sm text-muted-foreground">
              You need an admin role to review match submissions.{" "}
              <Link to="/tournament" className="text-sand underline">Back to tournaments</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl">Tournament Match Approvals</h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/tournaments"><ArrowLeft className="size-4 mr-1" />Tournaments</Link>
          </Button>
        </div>

        {rows.length === 0 && (
          <Card className="p-6 border-border/60 text-sm text-muted-foreground">
            No submissions waiting for review.
          </Card>
        )}

        {rows.map((row) => {
          const f = forms[row.id];
          if (!f) return null;
          return (
            <Card key={row.id} className="p-5 border-sand/40 bg-card/70 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg">Tournament #{row.tournament_num}</span>
                <span className="text-xs text-muted-foreground">
                  submitted {new Date(row.created_at).toLocaleString()}
                </span>
              </div>

              <ul className="text-sm space-y-1">
                {[...row.detected_players]
                  .sort((a, b) => a.placement - b.placement)
                  .map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-sand w-4 tabular-nums">{p.placement}</span>
                      <span className="flex-1">{p.player_name}</span>
                      <span className="text-muted-foreground">{p.leader_name ?? "—"}</span>
                      <span className="tabular-nums">{p.points} VP</span>
                    </li>
                  ))}
              </ul>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Round</Label>
                  <Input value={f.round} onChange={(e) => setForm(row.id, { round: e.target.value })} placeholder="Game 2" />
                </div>
                <div>
                  <Label className="text-xs">Table</Label>
                  <Input value={f.table} onChange={(e) => setForm(row.id, { table: e.target.value })} placeholder="Table 6" />
                </div>
              </div>

              {row.unmatched.length > 0 && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 space-y-3">
                  <p className="text-xs text-amber-300">
                    These screenshot players are not on the table roster. Correct the registered name so
                    it matches the screenshot.
                  </p>
                  {row.unmatched.map((u) => (
                    <div key={u.detected} className="grid sm:grid-cols-2 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Registered as (roster name)</Label>
                        <Input
                          value={
                            Object.keys(f.fixes).find((k) => f.fixes[k] === u.detected) ??
                            u.suggested ??
                            ""
                          }
                          onChange={(e) => {
                            const fixes = { ...f.fixes };
                            for (const k of Object.keys(fixes)) {
                              if (fixes[k] === u.detected) delete fixes[k];
                            }
                            if (e.target.value.trim()) fixes[e.target.value.trim()] = u.detected;
                            setForm(row.id, { fixes });
                          }}
                          placeholder="wrong roster name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Rename to (from screenshot)</Label>
                        <Input value={u.detected} readOnly className="opacity-80" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label className="text-xs">Or link by Match ID (optional)</Label>
                <Input
                  value={f.matchCode}
                  onChange={(e) => setForm(row.id, { matchCode: e.target.value })}
                  placeholder="ATREIDES-SHAIHULUD-4339"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to use the uploaded game. Enter a Match ID to attach a different game to
                  this tournament table instead.
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" disabled={busy === row.id} onClick={() => approve(row)}>
                  {busy === row.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Approve &amp; apply
                </Button>
                <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => reject(row)}>
                  <X className="size-4" /> Not a tournament game
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
