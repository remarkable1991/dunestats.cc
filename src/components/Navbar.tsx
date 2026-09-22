import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "./Logo";
import { NotificationCenter } from "./NotificationCenter";
import { Button } from "@/components/ui/button";
import { Trophy, Upload, LogOut, User as UserIcon, ListOrdered, BarChart3, Medal, Sparkles, Users } from "lucide-react";

export function Navbar() {
  const [userId, setUserId] = useState<string | null>(null);
  const [lfgCount, setLfgCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const { data } = await supabase
        .from("active_async_matches")
        .select("id")
        .eq("status", "searching");
      setLfgCount(data?.length ?? 0);
    };
    refresh();
    const channel = supabase
      .channel("navbar-lfg-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_async_matches" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 min-w-0 items-center justify-between gap-2 px-4">
        <div className="shrink-0">
          <Logo />
        </div>
        <nav className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/leaderboard">
              <Medal className="size-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/lfg">
              <Users className="size-4" />
              <span className="hidden sm:inline">LFG</span>
              {lfgCount > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  {lfgCount}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/matches">
              <ListOrdered className="size-4" />
              <span className="hidden sm:inline">Matches</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/stats">
              <BarChart3 className="size-4" />
              <span className="hidden sm:inline">Stats</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rewards">
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">Rewards</span>
            </Link>
          </Button>

          <Button asChild variant="ghost" size="sm">
            <Link to="/tournament">
              <Trophy className="size-4" />
              <span className="hidden sm:inline">Tournament</span>
            </Link>
          </Button>
          {userId ? (
            <>
              <NotificationCenter />
              <Button asChild variant="ghost" size="sm">
                <Link to="/upload">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">Upload</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/profile">
                  <UserIcon className="size-4" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>
              </Button>
              <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button asChild variant="default" size="sm">
              <Link to="/auth">
                <UserIcon className="size-4" />
                Sign in
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
