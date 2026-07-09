import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Strategy Arena" }] }),
  validateSearch: z.object({
    next: z.string().optional(),
    player: z.string().optional(),
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const nextPath = search.next ?? (search.player ? "/claim" : "/upload");
  const nextSearch = search.player ? { player: search.player } : undefined;
  const redirectAfter = () => {
    if (nextSearch) navigate({ to: nextPath as "/claim", search: nextSearch });
    else navigate({ to: nextPath as "/upload" });
  };
  const absoluteRedirect = (() => {
    if (typeof window === "undefined") return "/";
    const url = new URL(nextPath, window.location.origin);
    if (search.player) url.searchParams.set("player", search.player);
    return url.toString();
  })();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) redirectAfter();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username || email.split("@")[0] },
            emailRedirectTo: absoluteRedirect,
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        redirectAfter();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window === "undefined" ? "/" : new URL("/auth", window.location.origin).toString(),
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
    }
  };

  const handleDiscord = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: typeof window === "undefined" ? "/" : absoluteRedirect,
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Card className="w-full max-w-md p-8 border-border/60 bg-card/80 backdrop-blur shadow-arena">
          <h1 className="font-display text-2xl text-center mb-1">
            {mode === "signin" ? "Enter the Arena" : "Join the Arena"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">Track your Dune Imperium matches.</p>

          <Button onClick={handleGoogle} disabled={loading} variant="outline" className="w-full mb-2">
            Continue with Google
          </Button>
          <Button onClick={handleDiscord} disabled={loading} variant="outline" className="w-full mb-4">
            Continue with Discord
          </Button>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <span className="relative bg-card px-2 text-xs uppercase tracking-widest text-muted-foreground">or</span>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="username">Display name</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your in-game name"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {mode === "signin" && (
            <p className="text-xs text-center mt-3">
              <Link to="/forgot-password" className="text-sand hover:underline">
                Forgot your password?
              </Link>
            </p>
          )}

          <p className="text-sm text-center text-muted-foreground mt-4">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button onClick={() => setMode("signup")} className="text-sand hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button onClick={() => setMode("signin")} className="text-sand hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
