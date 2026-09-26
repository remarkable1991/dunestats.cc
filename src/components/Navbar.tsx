import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "./Logo";
import { NotificationCenter } from "./NotificationCenter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trophy, Upload, LogOut, User as UserIcon, ListOrdered, BarChart3, Medal, Sparkles, Users, Menu } from "lucide-react";

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
        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/tournament">
              <Trophy className="size-4" />
              Tournament
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm"><Link to="/leaderboard"><Medal className="size-4" />Leaderboard</Link></Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/lfg">
              <Users className="size-4" />LFG
              {lfgCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1 text-xs text-primary">{lfgCount}</span> : null}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm"><Link to="/matches"><ListOrdered className="size-4" />Matches</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/stats"><BarChart3 className="size-4" />Stats</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/rewards"><Sparkles className="size-4" />Rewards</Link></Button>
          {userId ? (
            <>
              <NotificationCenter />
              <Button asChild variant="ghost" size="sm"><Link to="/upload"><Upload className="size-4" />Upload</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link to="/profile"><UserIcon className="size-4" />Profile</Link></Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive hover:text-destructive">
                <LogOut className="size-4" />Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth"><UserIcon className="size-4" />Sign in</Link></Button>
          )}
        </nav>

        <nav className="flex min-w-0 flex-1 items-center justify-end gap-1 lg:hidden">
          <Button asChild variant="ghost" size="sm"><Link to="/tournament"><Trophy className="size-4" /><span className="hidden sm:inline">Tournament</span></Link></Button>
          {userId ? <><NotificationCenter /><Button asChild variant="ghost" size="sm"><Link to="/upload"><Upload className="size-4" /><span className="hidden sm:inline">Upload</span></Link></Button></> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Menu className="size-4" /><span className="hidden sm:inline">More</span>
                {lfgCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1 text-xs text-primary">{lfgCount}</span> : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Browse</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/leaderboard" className="gap-2"><Medal className="size-4" />Leaderboard</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/lfg" className="gap-2"><Users className="size-4" />LFG{lfgCount > 0 ? <span className="ml-auto text-xs text-primary">{lfgCount} open</span> : null}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/matches" className="gap-2"><ListOrdered className="size-4" />Matches</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/stats" className="gap-2"><BarChart3 className="size-4" />Stats</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/rewards" className="gap-2"><Sparkles className="size-4" />Rewards</Link></DropdownMenuItem>
              {userId ? <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel><DropdownMenuItem asChild><Link to="/profile" className="gap-2"><UserIcon className="size-4" />Profile</Link></DropdownMenuItem><DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive"><LogOut className="size-4" />Sign out</DropdownMenuItem></> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {!userId ? <Button asChild size="sm"><Link to="/auth"><UserIcon className="size-4" />Sign in</Link></Button> : null}
        </nav>
      </div>
    </header>
  );
}
