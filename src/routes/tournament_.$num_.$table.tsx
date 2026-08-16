import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { SupabaseImage } from "@/components/SupabaseImage";
import { signedUrlOrR2 } from "@/lib/storage-r2";
import { HeatmapBody, type HeatmapPlayer } from "@/components/AvailabilityHeatmap";
import { TableScheduleControls } from "@/components/TableScheduleControls";
import {
  type MatchSchedule,
  SCHEDULE_SELECT,
  discordEpoch,
  formatLocalMatchTime,
  parseScheduleTime,
  parseSuggestedSlots,
  voterStates,
} from "@/lib/match-schedules";
import { slugMatches, tableSlug } from "@/lib/tournament-slug";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Sparkles, Trophy, XCircle } from "lucide-react";

export const Route = createFileRoute("/tournament_/$num_/$table")({
  head: ({ params }) => {
    const title = `Tournament #${params.num} · ${params.table} · Strategy Arena`;
    const description = `Match details, scheduling votes, availability map and results for table ${params.table} in Strategy Arena tournament #${params.num}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: TableDetailPage,
});

type Row = {
  id: string;
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  discord_username: string | null;
  leader_name: string | null;
  placement: number | null;
  points: number | null;
  table_score: number | null;
  player_compatibility_score: number | null;
  player_availability: string[] | null;
  is_backup: boolean | null;
};

function fmtScore(n: number | string | null | undefined): string {
  if (n == null) return "\u2014";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function TableDetailPage() {
  const { num, table } = Route.useParams();
  const tournamentNum = Number(num);

  const [rows, setRows] = useState<Row[]>([]);
  const [schedule, setSchedule] = useState<MatchSchedule | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [myKeys, setMyKeys] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [matchRes, schedRes, shotRes] = await Promise.all([
      supabase
        .from("tournament_matches")
        .select(
          "id, tournament_num, round_type, table_identifier, player_name, discord_username, leader_name, placement, points, table_score, player_compatibility_score, player_availability, is_backup",
        )
        .eq("tournament_num", tournamentNum),
      supabase.from("tournament_match_schedules").select(SCHEDULE_SELECT).eq("tournament_num", tournamentNum),
      supabase.from("tournament_table_screenshots").select("*").eq("tournament_num", tournamentNum),
    ]);

    const all = (matchRes.data ?? []) as Row[];
    const mine = all.filter((r) => slugMatches(table, r.round_type, r.table_identifier));
    setRows(mine);

    const rt = mine[0]?.round_type;
    const ti = mine[0]?.table_identifier;
    const sched =
      ((schedRes.data ?? []) as unknown as MatchSchedule[]).find((s) =>
        rt ? s.round_type === rt && s.table_identifier === ti : slugMatches(table, s.round_type, s.table_identifier),
      ) ?? null;
    setSchedule(sched);

    const shotRow = ((shotRes.data ?? []) as { round_type: string; table_identifier: string; image_url: string }[]).find(
      (s) => slugMatches(table, s.round_type, s.table_identifier),
    );
    setShot(shotRow?.image_url ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentNum, table]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!uid) return;
      const [{ data: ratings }, { data: roles }] = await Promise.all([
        supabase.from("player_ratings").select("player_key").eq("claimed_by", uid),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      setMyKeys(new Set((ratings ?? []).map((r) => r.player_key)));
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
    })();
  }, []);

  useEffect(() => {
    if (!shot) {
      setShotUrl(null);
      return;
    }
    void signedUrlOrR2("match-screenshots", shot, 3600).then(setShotUrl);
  }, [shot]);

  const isMine = (name: string) => myKeys.has(name.toLowerCase().trim());
  const seats = useMemo(() => [...rows].sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9)), [rows]);
  const finished = seats.filter((r) => r.placement != null && r.points != null).length >= 4;
  const heading = rows[0] ? `${rows[0].round_type} · ${rows[0].table_identifier}` : table;
  const voters = useMemo(() => voterStates(schedule), [schedule]);
  const suggestions = useMemo(() => parseSuggestedSlots(schedule?.suggested_slots), [schedule]);
  const confirmed = parseScheduleTime(schedule);

  const heatmapPlayers: HeatmapPlayer[] = seats.map((r) => ({
    player_name: r.player_name,
    discord_username: r.discord_username,
    player_compatibility_score: r.player_compatibility_score,
    player_availability: r.player_availability,
  }));

  const availabilityCard = (
    <Card className="p-4 sm:p-6 border-border/60 bg-card/70">
      <h2 className="font-display text-xl mb-1 flex items-center gap-2">
        <Sparkles className="size-5 text-sand" /> Availability Map
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        30-minute slots in your local timezone. Click any time to copy its Discord timestamp code.
      </p>
      <HeatmapBody
        tableId={heading}
        matchQuality={rows[0]?.table_score ?? null}
        players={heatmapPlayers}
        suggestedSlots={schedule?.suggested_slots}
        myPlayerName={seats.find((r) => isMine(r.player_name))?.player_name ?? null}
      />
    </Card>
  );

  const resultCard = (
    <Card className="p-4 sm:p-6 border-border/60 bg-card/70">
      <h2 className="font-display text-xl mb-4 flex items-center gap-2">
        <Trophy className="size-5 text-sand" /> Match Result
      </h2>
      {finished ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead className="text-right">VP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seats.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.placement ?? "—"}</TableCell>
                  <TableCell>
                    <Link
                      to="/players/$key"
                      params={{ key: r.player_name.toLowerCase().trim() }}
                      className="hover:text-sand transition"
                    >
                      {r.player_name}
                    </Link>
                    {r.is_backup && <span className="ml-2 text-[10px] text-muted-foreground">🛡️ Backup</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.leader_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.points ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {shotUrl && (
            <a href={shotUrl} target="_blank" rel="noopener noreferrer" className="block mt-4">
              <SupabaseImage
                bucket="match-screenshots"
                src={shotUrl}
                alt={`Result screenshot for ${heading}`}
                className="w-full h-auto rounded border border-border/50 max-h-[60vh] object-contain bg-background/40"
              />
            </a>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground italic">This match has not been reported yet.</p>
      )}
    </Card>
  );

  const scheduleCard = (
    <Card className="p-4 sm:p-6 border-border/60 bg-card/70 space-y-4">
      <h2 className="font-display text-xl flex items-center gap-2">
        <Clock className="size-5 text-sand" /> Scheduling
      </h2>
      {!schedule ? (
        <p className="text-sm text-muted-foreground italic">No Discord schedule thread for this table.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              {schedule.mode ?? "—"} · {schedule.status ?? "—"}
            </span>
            {confirmed && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                📅 {formatLocalMatchTime(confirmed)}
              </span>
            )}
            <TableScheduleControls
              schedule={schedule}
              finished={finished}
              canStart={isAdmin || seats.some((r) => isMine(r.player_name))}
              title={`Dune Imperium · ${heading}`}
              onChanged={load}
            />
          </div>

          <div>
            <h3 className="font-display text-sm text-sand mb-2">Votes ({schedule.votes_count ?? 0}/{voters.length || 4})</h3>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {voters.map((v) => (
                <li
                  key={v.player_name}
                  className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                    v.voted ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {v.voted ? (
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-red-400 shrink-0" />
                    )}
                    <span className="truncate">{v.player_name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.voted ? v.labels.join(" ") : "no vote yet"}
                  </span>
                </li>
              ))}
              {voters.length === 0 && <li className="text-muted-foreground italic">No voters recorded.</li>}
            </ul>
          </div>

          {suggestions.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-sand mb-2">Slot tally</h3>
              <ul className="space-y-1 text-sm">
                {suggestions.map((s, i) => {
                  const e = discordEpoch(s.time_text);
                  const backers = voters.filter((v) => v.labels.includes(s.label)).map((v) => v.player_name);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sand">{s.label || String.fromCharCode(65 + i)}</span>
                      <span className="tabular-nums">
                        {e != null ? formatLocalMatchTime(new Date(e * 1000)) : s.time_text}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {backers.length}/{voters.length || 4}
                        {backers.length > 0 ? ` · ${backers.join(", ")}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to="/tournament" search={{ t: tournamentNum }}>
              <ArrowLeft className="size-4 mr-1" /> Tournament #{tournamentNum}
            </Link>
          </Button>
          {rows[0]?.table_score != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sand/40 bg-sand/15 px-2 py-0.5 text-xs text-sand">
              <Sparkles className="size-3" /> Match Quality {fmtScore(rows[0].table_score)}
            </span>
          )}
        </div>

        <h1 className="font-display text-3xl">
          {heading}
          <span className="ml-3 text-base text-muted-foreground font-mono">
            {rows[0] ? tableSlug(rows[0].round_type, rows[0].table_identifier) : table}
          </span>
        </h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-6 border-border/60 bg-card/70">
            <p className="text-sm text-muted-foreground">No table matching “{table}” in tournament #{tournamentNum}.</p>
          </Card>
        ) : finished ? (
          <>
            {resultCard}
            {scheduleCard}
            {availabilityCard}
          </>
        ) : (
          <>
            {scheduleCard}
            {availabilityCard}
            {resultCard}
          </>
        )}
      </main>
    </div>
  );
}
