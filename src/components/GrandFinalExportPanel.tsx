import { useMemo } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clipboard, Download, Send } from "lucide-react";
import { botCsv, findTableSlots, slotUnix, type SemiDraft, type SemiTable } from "@/lib/tournament-semifinals";

type Player = { player_name: string; discord_username: string | null; player_availability: string[] | null };

export function GrandFinalExportPanel({ tournamentNum, title, players, live }: { tournamentNum: number; title: string; players: Player[]; live: boolean }) {
  const names = players.map((p) => p.player_name);
  const slots = useMemo(() => {
    if (!live) return [];
    const now = new Date();
    return findTableSlots({
      players: names,
      availability: new Map(players.map((p) => [p.player_name, p.player_availability ?? []])),
      windowStart: now,
      windowEnd: new Date(now.getTime() + 21 * 86_400_000),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, JSON.stringify(players)]);

  const discordOf = (p: string) => players.find((x) => x.player_name === p)?.discord_username ?? null;
  const table = { name: title, players: names, slots } as unknown as SemiTable;
  const draft = { tables: [table] } as unknown as SemiDraft;
  const ping = (p: string) => (discordOf(p)?.trim() ? `@${discordOf(p)!.trim()} (${p})` : `**${p}**`);

  const text = [
    `**Tournament ${tournamentNum} — ${title}**`,
    `__${title}__: ${names.map(ping).join(", ")}`,
    ...(live
      ? slots.map((s, i) => `Option ${i + 1}: <t:${slotUnix(s)}:F> · ${s.blocks * 30} min${s.missing.length ? ` (3/4 — check ${s.missing.join(", ")})` : ""}`)
      : ["Async — no time suggestions; play at your own pace."]),
  ].join("\n");

  const download = () => {
    const blob = new Blob([botCsv(tournamentNum, draft, discordOf)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `T${tournamentNum}_${title.replace(/\W+/g, "_")}_bot.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async (v: string, msg: string) => { await navigator.clipboard.writeText(v); toast.success(msg); };

  return (
    <Card className="p-4 sm:p-6 border-border/60 bg-card/70 space-y-3">
      <h2 className="font-display text-xl flex items-center gap-2"><Send className="size-5 text-sand" /> Admin · Bot export</h2>
      {live ? (
        slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No 4/4 or 3/4 windows in the next 3 weeks. The file will have empty slots.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {slots.map((s, i) => (
              <li key={s.start}>
                <span className="font-mono text-sand">{String.fromCharCode(65 + i)}</span>{" "}
                {new Date(s.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {s.blocks * 30} min ·{" "}
                {s.type === "perfect" ? <span className="text-primary">4/4</span> : <span className="text-muted-foreground">3/4 — check {s.missing.join(", ")}</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Async tournament: the file contains players only, no time suggestions.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={download}><Download className="size-4" />Download bot CSV</Button>
        <Button size="sm" variant="outline" onClick={() => copy(text, "Discord text copied")}><Clipboard className="size-4" />Copy Discord text</Button>
      </div>
    </Card>
  );
}
