import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Repeat, Copy } from "lucide-react";
import type { MatchSchedule } from "@/lib/match-schedules";
import { remainingSlotTallies, subRequestText } from "@/lib/tournament-substitute";
import {
  listSubstituteCandidates,
  replaceTournamentPlayer,
  searchSubstituteDiscord,
  type SubCandidate,
} from "@/lib/tournament-substitute.functions";

const FIT_BADGE = { perfect: "🟢 Perfect fit", partial: "🟡 Partial fit", none: "⚪ No overlap / data" } as const;

export function ReplacePlayerDialog({ schedule, onDone }: { schedule: MatchSchedule; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [oldIndex, setOldIndex] = useState<number | null>(null);
  const [cands, setCands] = useState<SubCandidate[] | null>(null);
  const [loadingCands, setLoadingCands] = useState(false);
  const [ign, setIgn] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [discordUser, setDiscordUser] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ ign: string; discordId: string; discordUsername: string | null; verified: boolean }[]>([]);
  const [linkMapping, setLinkMapping] = useState(false);
  const [busy, setBusy] = useState(false);

  const listFn = useServerFn(listSubstituteCandidates);
  const searchFn = useServerFn(searchSubstituteDiscord);
  const replaceFn = useServerFn(replaceTournamentPlayer);

  const names = schedule.player_names ?? [];
  const tallies = useMemo(() => (oldIndex == null ? [] : remainingSlotTallies(schedule, oldIndex)), [schedule, oldIndex]);

  useEffect(() => {
    if (oldIndex == null) return;
    setCands(null);
    setLoadingCands(true);
    listFn({ data: { scheduleId: schedule.id, oldIndex } })
      .then((r) => setCands(r.candidates))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingCands(false));
  }, [oldIndex, schedule.id, listFn]);

  useEffect(() => {
    if (term.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      searchFn({ data: { term } }).then((r) => setResults(r.results)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [term, searchFn]);

  const pick = (c: { name?: string; ign?: string; discordId: string | null; discordUsername: string | null }, manual: boolean) => {
    setIgn(c.name ?? c.ign ?? "");
    setDiscordId(c.discordId ?? "");
    setDiscordUser(c.discordUsername ?? "");
    setLinkMapping(manual);
  };

  const copyPost = async () => {
    await navigator.clipboard.writeText(
      subRequestText({ tournamentNum: schedule.tournament_num, roundType: schedule.round_type, table: schedule.table_identifier, matchCode: schedule.match_code, tallies }),
    );
    toast.success("Discord sub request copied");
  };

  const confirm = async () => {
    if (oldIndex == null) return;
    setBusy(true);
    try {
      const r = await replaceFn({
        data: { scheduleId: schedule.id, oldIndex, newName: ign.trim(), newDiscordId: discordId.trim(), newDiscordUsername: discordUser.trim() || null, linkMapping },
      });
      toast.success(`${r.oldName} replaced by ${r.newName}. Their votes were cleared; the Discord bot will update the thread and invite the new player.`);
      setOpen(false);
      setOldIndex(null);
      setIgn("");
      setDiscordId("");
      setDiscordUser("");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const validId = /^\d{17,20}$/.test(discordId.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Repeat className="size-3.5 mr-1" /> Replace player
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Replace player · {schedule.round_type} {schedule.table_identifier}</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">1. Who is being replaced?</h3>
          <div className="flex flex-wrap gap-2">
            {names.map((n, i) => (
              <Button key={i} size="sm" variant={oldIndex === i ? "default" : "outline"} onClick={() => setOldIndex(i)}>
                {n}
              </Button>
            ))}
          </div>
        </section>

        {oldIndex != null && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Suggested times (votes from remaining players)</h3>
                <Button size="sm" variant="outline" onClick={copyPost}>
                  <Copy className="size-3.5 mr-1" /> Copy Discord sub request
                </Button>
              </div>
              <ul className="text-sm space-y-1">
                {tallies.length === 0 && <li className="text-muted-foreground italic">No suggested times on this table.</li>}
                {tallies.map((t) => (
                  <li key={t.label} className="flex justify-between rounded border border-border/50 px-2 py-1">
                    <span>
                      {t.label} {t.epoch ? new Date(t.epoch * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : t.time_text}
                    </span>
                    <span className="text-muted-foreground">{t.yes}/{t.of}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">2. Choose the replacement</h3>
              <Tabs defaultValue="reserves">
                <TabsList>
                  <TabsTrigger value="reserves">Registered players</TabsTrigger>
                  <TabsTrigger value="manual">Manual entry</TabsTrigger>
                </TabsList>
                <TabsContent value="reserves" className="space-y-1 max-h-64 overflow-y-auto">
                  {loadingCands && <Loader2 className="size-4 animate-spin" />}
                  {cands?.length === 0 && <p className="text-sm text-muted-foreground">No unseated registered players.</p>}
                  {cands?.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => pick(c, false)}
                      className={`w-full text-left rounded border px-2 py-1.5 text-sm hover:bg-muted/40 ${ign === c.name ? "border-primary" : "border-border/50"}`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs">{FIT_BADGE[c.fit]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.slots.length ? `Free at ${c.slots.join(", ")}` : c.hasAvailability ? "No suggested slot match" : "No availability saved"}
                        {" · "}
                        {c.discordId ? `@${c.discordUsername ?? c.discordId}` : "No Discord ID found — fill it in below"}
                      </div>
                    </button>
                  ))}
                </TabsContent>
                <TabsContent value="manual" className="space-y-2">
                  <Input placeholder="Search IGN or Discord name…" value={term} onChange={(e) => setTerm(e.target.value)} />
                  {results.map((r) => (
                    <button key={r.discordId} type="button" onClick={() => pick(r, !r.verified)} className="w-full text-left rounded border border-border/50 px-2 py-1 text-sm hover:bg-muted/40">
                      {r.ign} · @{r.discordUsername ?? r.discordId} {r.verified ? "✓ linked" : "(server member)"}
                    </button>
                  ))}
                </TabsContent>
              </Tabs>
              <div className="grid sm:grid-cols-3 gap-2">
                <Input placeholder="IGN (required)" value={ign} onChange={(e) => setIgn(e.target.value)} />
                <Input placeholder="Discord user ID (required)" value={discordId} onChange={(e) => setDiscordId(e.target.value)} />
                <Input placeholder="Discord username" value={discordUser} onChange={(e) => setDiscordUser(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={linkMapping} onChange={(e) => setLinkMapping(e.target.checked)} />
                Link this Discord ID to the IGN if it has no link yet (existing links are never changed)
              </label>
            </section>

            <Button className="w-full" disabled={busy || !ign.trim() || !validId} onClick={confirm}>
              {busy && <Loader2 className="size-4 mr-1 animate-spin" />} Confirm replacement: {names[oldIndex]} → {ign || "…"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
