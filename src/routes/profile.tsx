import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { User as UserIcon, UserPlus, BadgeCheck, Trophy, KeyRound, Link2, Gift, Copy } from "lucide-react";
import { loadChampions, type ChampionMap } from "@/lib/champions";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My profile · Strategy Arena" }] }),
  component: ProfileLanding,
});

type Claim = { player_key: string; display_name: string; game_version: string; elo: number; games_played: number };

function ProfileLanding() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [champions, setChampions] = useState<ChampionMap>(new Map());
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);
  const [discordIdentityId, setDiscordIdentityId] = useState<string | null>(null);
  const [linkingDiscord, setLinkingDiscord] = useState(false);
  const [unlinkingDiscord, setUnlinkingDiscord] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [identities, setIdentities] = useState<string[]>([]);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const refreshDiscordIdentity = async (uid: string) => {
    const { data: ids } = await supabase.auth.getUserIdentities();
    const list = ids?.identities ?? [];
    setIdentities(list.map((i) => i.provider));
    const discord = list.find((i) => i.provider === "discord");
    if (discord) {
      const idata = (discord.identity_data ?? {}) as Record<string, unknown>;
      const uname =
        (idata.user_name as string | undefined) ||
        (idata.preferred_username as string | undefined) ||
        (idata.full_name as string | undefined) ||
        (idata.name as string | undefined) ||
        null;
      setDiscordIdentityId(discord.id);
      setDiscordUsername(uname);
      if (uname) {
        await supabase
          .from("profiles")
          .update({ discord_username: uname })
          .eq("id", uid);
      }
    } else {
      setDiscordIdentityId(null);
      setDiscordUsername(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth", search: { next: "/profile" } });
        return;
      }
      setUserId(uid);
      const { data: rows } = await supabase
        .from("player_ratings")
        .select("player_key, display_name, game_version, elo, games_played")
        .eq("claimed_by", uid);
      setClaims((rows as Claim[]) ?? []);
      await refreshDiscordIdentity(uid);
      setChecking(false);
    });
  }, [navigate]);

  const linkGoogle = async () => {
    setLinkingGoogle(true);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: typeof window !== "undefined" ? window.location.origin + "/profile" : undefined,
    });
    setLinkingGoogle(false);
    if ("error" in res && res.error) toast.error(res.error.message);
  };

  const linkDiscord = async () => {
    setLinkingDiscord(true);
    const { error } = await supabase.auth.linkIdentity({
      provider: "discord",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin + "/profile" : undefined,
      },
    });
    setLinkingDiscord(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("already")
          ? "This Discord account is already linked to another profile."
          : error.message,
      );
    }
  };

  const unlinkDiscord = async () => {
    if (!userId) return;
    const { data: ids } = await supabase.auth.getUserIdentities();
    const discord = ids?.identities?.find((i) => i.provider === "discord");
    if (!discord) return;
    setUnlinkingDiscord(true);
    try {
      const { error } = await supabase.auth.unlinkIdentity(discord);
      if (error) throw error;
      await supabase.from("profiles").update({ discord_username: null }).eq("id", userId);
      await refreshDiscordIdentity(userId);
      toast.success("Discord unlinked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setUnlinkingDiscord(false);
    }
  };


  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  useEffect(() => {
    void loadChampions().then((m) => setChampions(new Map(m)));
  }, []);

  if (checking) return null;

  // Unique by player_key
  const seen = new Set<string>();
  const unique = claims.filter((c) => {
    if (seen.has(c.player_key)) return false;
    seen.add(c.player_key);
    return true;
  });

  // Aggregate this user's tournament wins from the champions map.
  const myWins: { tournament_num: number; player: string }[] = [];
  for (const c of unique) {
    const wins = champions.get(c.player_key) ?? [];
    for (const w of wins) myWins.push({ tournament_num: w.tournament_num, player: c.display_name });
  }
  myWins.sort((a, b) => b.tournament_num - a.tournament_num);
  const totalWins = myWins.length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
          <UserIcon className="size-7 text-sand" />
          <h1 className="font-display text-3xl flex items-center gap-2">
            {totalWins >= 3 && <Trophy className="size-6 text-sand" aria-label="Hall of Fame Champion" />}
            My profile
          </h1>
        </div>
        <p className="text-muted-foreground mb-6">
          {userId ? "Your claimed in-game names appear below." : ""}
        </p>

        {myWins.length > 0 && (
          <Card className="p-5 border-sand/40 bg-gradient-to-br from-card to-card/40 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="size-5 text-sand" />
              <h2 className="font-display text-lg">Tournament wins ({totalWins})</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {myWins.map((w) => (
                <Link
                  key={`${w.tournament_num}-${w.player}`}
                  to="/tournament"
                  className="inline-flex items-center gap-1 text-xs rounded-full border border-sand/40 bg-sand/10 text-sand px-3 py-1 hover:bg-sand/20 transition"
                >
                  <Trophy className="size-3.5" /> Tournament #{w.tournament_num}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {unique.length === 0 ? (
          <Card className="p-6 border-border/60 bg-card/70 text-center">
            <p className="text-muted-foreground mb-4">
              You haven't claimed any in-game name yet.
            </p>
            <Button asChild>
              <Link to="/claim">
                <UserPlus className="size-4" /> Claim your name
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {unique.map((c) => (
              <Link
                key={c.player_key}
                to="/players/$key"
                params={{ key: c.player_key }}
                className="block"
              >
                <Card className="p-4 border-border/60 bg-card/70 hover:border-sand transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BadgeCheck className="size-5 text-teal" />
                    <div>
                      <div className="font-medium">{c.display_name}</div>
                      <div className="text-xs text-muted-foreground">View personal stats</div>
                    </div>
                  </div>
                  <span className="text-sm text-sand">→</span>
                </Card>
              </Link>
            ))}
            <div className="text-center mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/claim">
                  <UserPlus className="size-4" /> Claim another name
                </Link>
              </Button>
            </div>
          </div>
        )}

        {unique.length > 0 && (
          <Card className="p-5 border-sand/40 bg-gradient-to-br from-card to-card/40 mt-6">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="size-5 text-sand" />
              <h2 className="font-display text-lg">Your referral link</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Share this link. When a friend signs up you get <span className="text-foreground">+100 SP</span>, they get <span className="text-foreground">+50 SP</span>, and you get a <span className="text-foreground">+500 SP</span> jackpot once they reach 100 lifetime SP.
            </p>
            {(() => {
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const link = `${origin}/r/${unique[0].player_key}`;
              return (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        toast.success("Referral link copied");
                      } catch {
                        toast.error("Couldn't copy — select the link and copy manually.");
                      }
                    }}
                  >
                    <Copy className="size-4" /> Copy
                  </Button>
                </div>
              );
            })()}
          </Card>
        )}


        <Card className="p-5 border-border/60 bg-card/70 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="size-5 text-sand" />
            <h2 className="font-display text-lg">Linked accounts</h2>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">Google</div>
              <div className="text-xs text-muted-foreground">
                {identities.includes("google") ? "Linked" : "Not linked"}
              </div>
            </div>
            {identities.includes("google") ? (
              <span className="text-xs text-teal">✓ Connected</span>
            ) : (
              <Button onClick={linkGoogle} disabled={linkingGoogle} variant="outline" size="sm">
                {linkingGoogle ? "Linking…" : "Link Google"}
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5 border-border/60 bg-card/70 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="size-5 text-sand" />
            <h2 className="font-display text-lg">Discord</h2>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">Discord</div>
              <div className="text-xs text-muted-foreground">
                {discordIdentityId
                  ? discordUsername
                    ? `Linked as ${discordUsername}`
                    : "Linked"
                  : "Not linked"}
              </div>
            </div>
            {discordIdentityId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-teal">✓ Connected</span>
                <Button onClick={unlinkDiscord} disabled={unlinkingDiscord} variant="outline" size="sm">
                  {unlinkingDiscord ? "Unlinking…" : "Unlink"}
                </Button>
              </div>
            ) : (
              <Button onClick={linkDiscord} disabled={linkingDiscord} variant="outline" size="sm">
                {linkingDiscord ? "Linking…" : "Link Discord"}
              </Button>
            )}
          </div>
        </Card>


        <Card className="p-5 border-border/60 bg-card/70 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="size-5 text-sand" />
            <h2 className="font-display text-lg">Change password</h2>
          </div>
          <form onSubmit={updatePassword} className="space-y-3">
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={savingPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}