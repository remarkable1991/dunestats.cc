import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Trophy, Upload, LogOut, User as UserIcon, ListOrdered, BarChart3, Medal, Sparkles } from "lucide-react";

export function Navbar() {
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/leaderboard">
              <Medal className="size-4" />
              <span className="hidden sm:inline">Leaderboard</span>
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
