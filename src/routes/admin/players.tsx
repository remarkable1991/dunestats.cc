import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useRoles } from "@/hooks/use-roles";
import { lookupPlayerName, renamePlayerEverywhere, deleteNameAlias } from "@/lib/player-admin.functions";

export const Route = createFileRoute("/admin/players")({
  head: () => ({
    meta: [
      { title: "Player Names — Strategy Arena Admin" },
      { name: "description", content: "Correct player names across tournaments, registrations and accounts." },
      { property: "og:title", content: "Player Names — Strategy Arena Admin" },
      { property: "og:description", content: "Correct player names across tournaments, registrations and accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPlayers,
});

type Lookup = Awaited<ReturnType<typeof lookupPlayerName>>;

function AdminPlayers() {
  const roles = useRoles();
  const lookup = useServerFn(lookupPlayerName);
  const rename = useServerFn(renamePlayerEverywhere);
  const removeAlias = useServerFn(deleteNameAlias);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [oldName, setOldName] = useState("");
  const [newName, setNewName] = useState("");
  const [opts, setOpts] = useState({ updateSeats: true, updateRegistrations: true, updateAccount: true });

  const runSearch = async (term = search) => {
    if (term.trim().length < 2) return;
    setBusy(true);
    try {
      setData(await lookup({ data: { name: term } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await rename({ data: { oldName, newName, ...opts } });
      toast.success(
        `Updated ${r.seats} tournament seats, ${r.registrations} registrations${r.claimed ? ", account claim moved" : ""}${r.alias ? ", correction remembered" : ""}`,
      );
      await runSearch(newName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply correction");
    } finally {
      setBusy(false);
    }
  };

  if (roles.loading) return <div className="min-h-screen"><Navbar /></div>;
  if (!roles.isAdmin)
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-12 text-muted-foreground">Main admins only.</main>
      </div>
    );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl text-foreground">Player names</h1>
          <p className="text-sm text-muted-foreground">
            Find a name everywhere it is used and correct it in one go. Old names are remembered, so a player who
            registers with the wrong name later gets asked “is this you?”.
          </p>
        </div>

        <Card className="space-y-4 p-5">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void runSearch(); }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, e.g. kevin_spinti" />
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search</Button>
          </form>

          {data && (
            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Player records">
                {data.ratings.map((r: any) => (
                  <Row key={r.player_key}>
                    <Link to="/players/$key" params={{ key: r.player_key }} className="text-primary hover:underline">{r.display_name}</Link>
                    <span className="flex gap-2">
                      {r.claimed_by ? <Badge>Account</Badge> : <Badge variant="outline">Unclaimed</Badge>}
                      <PickButtons name={r.display_name} setOld={setOldName} setNew={setNewName} />
                    </span>
                  </Row>
                ))}
              </Section>
              <Section title="Tournament seats">
                {data.seats.map((s) => (
                  <Row key={s.name}>
                    <span>{s.name} <span className="text-xs text-muted-foreground">T{s.tournaments.join(", T")}</span></span>
                    <PickButtons name={s.name} setOld={setOldName} setNew={setNewName} />
                  </Row>
                ))}
              </Section>
              <Section title="Registrations">
                {data.registrations.map((r: any) => (
                  <Row key={r.id}>
                    <span>
                      T{r.tournament_num} · {r.direwolf_name}
                      <span className="block text-xs text-muted-foreground">
                        {r.discord_username} · {r.user_id ? "account" : "guest"} · edited {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                    </span>
                    <PickButtons name={r.direwolf_name} setOld={setOldName} setNew={setNewName} />
                  </Row>
                ))}
              </Section>
              <Section title="Remembered corrections">
                {data.aliases.map((a: any) => (
                  <Row key={a.id}>
                    <span className="flex items-center gap-2">{a.old_name} <ArrowRight className="size-3" /> {a.canonical_name}</span>
                    <Button size="icon" variant="ghost" onClick={async () => { await removeAlias({ data: { id: a.id } }); void runSearch(); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </Row>
                ))}
              </Section>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-xl text-foreground">Correct a name</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Wrong name</Label><Input value={oldName} onChange={(e) => setOldName(e.target.value)} /></div>
            <div><Label>Correct name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          </div>
          <div className="space-y-2 text-sm">
            {([
              ["updateSeats", "Update every tournament standing/seat with this name"],
              ["updateRegistrations", "Update tournament registrations (so they can edit availability later)"],
              ["updateAccount", "If they have an account: move their claimed name and username to the correct name"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <Checkbox checked={opts[k]} onCheckedChange={(v) => setOpts((o) => ({ ...o, [k]: !!v }))} /> {label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">The correction is always remembered, even for players without an account.</p>
          </div>
          <Button onClick={apply} disabled={busy || !oldName.trim() || !newName.trim()}>Apply correction</Button>
        </Card>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {empty ? <p className="text-sm text-muted-foreground">Nothing found.</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm">{children}</div>;
}
function PickButtons({ name, setOld, setNew }: { name: string; setOld: (s: string) => void; setNew: (s: string) => void }) {
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOld(name)}>Wrong</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNew(name)}>Correct</Button>
    </span>
  );
}
