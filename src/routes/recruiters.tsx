import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, Gift, Trophy, ImageIcon, UserPlus, Coins } from "lucide-react";
import { titleColor } from "@/lib/player-title";

export const Route = createFileRoute("/recruiters")({
  head: () => ({
    meta: [
      { title: "Recruiter Competition · Strategy Arena" },
      {
        name: "description",
        content:
          "Recruiter competition leaderboard. Earn points by recruiting players to Strategy Arena through Discord proof, referral signups, and referral milestones.",
      },
      { property: "og:title", content: "Recruiter Competition · Strategy Arena" },
      {
        property: "og:description",
        content:
          "Earn points by recruiting players to Strategy Arena. Top 3 recruiters win a Steam key.",
      },
    ],
  }),
  component: RecruitersPage,
});

type LeaderboardRow = {
  user_id: string;
  player_key: string;
  prize_rank: number | null;
  total_points: number;
  image_upload_count: number;
  referral_signup_count: number;
  referral_jackpot_count: number;
  total_qualifying_events: number;
};

function RecruitersPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [lifetimeSp, setLifetimeSp] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [
        { data: lb, error: lbError },
        { data: ratings, error: ratingsError },
        { data: spRows, error: spError },
      ] = await Promise.all([
        supabase.rpc("get_recruitment_leaderboard"),
        supabase
          .from("player_ratings")
          .select("player_key, display_name")
          .eq("game_version", "overall"),
        supabase.from("player_sp").select("player_key, lifetime_sp"),
      ]);
      if (lbError) console.error(lbError);
      if (ratingsError) console.error(ratingsError);
      if (spError) console.error(spError);
      const nameMap: Record<string, string> = {};
      (ratings ?? []).forEach((r) => {
        nameMap[r.player_key] = r.display_name;
      });
      const spMap: Record<string, number> = {};
      (spRows ?? []).forEach((r) => {
        spMap[r.player_key] = Math.max(spMap[r.player_key] ?? 0, r.lifetime_sp ?? 0);
      });
      setNames(nameMap);
      setLifetimeSp(spMap);
      setRows((lb ?? []) as LeaderboardRow[]);
      setLoading(false);
    })();
  }, []);

  const displayRows = useMemo(
    () =>
      rows.map((r, i) => ({
        ...r,
        displayName: names[r.player_key] ?? r.player_key,
        lifetimeSp: lifetimeSp[r.player_key] ?? 0,
        position: i + 1,
      })),
    [rows, names, lifetimeSp],
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Users className="size-7 text-sand" />
          <h1 className="font-display text-3xl sm:text-4xl">Recruiter Competition Leaderboard</h1>
        </div>

        <Card className="p-5 sm:p-6 mb-6 border-border/60 bg-card/70 shadow-arena">
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              To kick off this new chapter, we are introducing a competitive reward track for our most effective recruiters running until September 1st!
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-3">
                <ImageIcon className="size-4 text-sand mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">1 POINT</strong>: Post screenshot proof of recruiting players in-game on our Discord.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <UserPlus className="size-4 text-teal mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">2 POINTS</strong>: Every unique player who signs up using your personal referral link.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Coins className="size-4 text-coral mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">10 POINTS</strong>: Whenever one of your referred sign-ups hits 100 SP total on their account.
                </span>
              </li>
            </ul>
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="size-4 text-sand" />
                <strong className="text-foreground">The Prizes</strong>
              </div>
              <p className="text-sm text-muted-foreground">
                The Top 3 Recruiters at the end of the event win a digital Steam key (1st choice down to 3rd)!
                <br />
                Choices: <span className="text-foreground">Wingspan</span> |{" "}
                <span className="text-foreground">Terraforming Mars</span> |{" "}
                <span className="text-foreground">Dune: Imperium</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left w-16">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Total Points</th>
                  <th className="px-4 py-3 text-right">Proof Screenshots</th>
                  <th className="px-4 py-3 text-right">Referrals</th>
                  <th className="px-4 py-3 text-right">Jackpots</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Loading recruiter leaderboard…
                    </td>
                  </tr>
                )}
                {!loading && displayRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No recruiters on the board yet. Start recruiting!
                    </td>
                  </tr>
                )}
                {!loading &&
                  displayRows.map((r) => {
                    const isTopThree = r.prize_rank != null && r.prize_rank <= 3;
                    const medal =
                      r.prize_rank === 1
                        ? "bg-sand text-sand-foreground"
                        : r.prize_rank === 2
                          ? "bg-teal/80 text-background"
                          : r.prize_rank === 3
                            ? "bg-coral/90 text-white"
                            : "bg-muted text-muted-foreground";
                    return (
                      <tr
                        key={r.player_key}
                        className="border-t border-border/40 hover:bg-secondary/30"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex size-7 items-center justify-center rounded font-bold text-xs ${medal}`}
                          >
                            {r.prize_rank ?? "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to="/players/$key"
                            params={{ key: r.player_key }}
                            className="hover:underline underline-offset-2"
                            style={{ color: titleColor(r.lifetimeSp) }}
                          >
                            <span className="inline-flex items-center gap-1">
                              {isTopThree && <Trophy className="size-3.5 text-sand" />}
                              {r.displayName}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-display text-sand tabular-nums">
                          {r.total_points.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.image_upload_count}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.referral_signup_count}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.referral_jackpot_count}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
