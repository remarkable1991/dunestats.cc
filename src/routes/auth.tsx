import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Strategy Arena" }] }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/upload" });
    });
  }, [navigate]);

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
            emailRedirectTo: `${window.location.origin}/upload`,
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/upload" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/upload`,
    });
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error.message);
    } else if (!("redirected" in res) || !res.redirected) {
      navigate({ to: "/upload" });
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Card className="w-full max-w-md p-8 border-border/60 bg-card/80 backdrop-blur shadow-arena">
          <h1 className="font-display text-2xl text-center mb-1">
            {mode === "signin" ? "Enter the Arena" : "Join the Arena"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Track your Dune Imperium matches.
          </p>

          <Button onClick={handleGoogle} disabled={loading} variant="outline" className="w-full mb-4">
            Continue with Google
          </Button>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/60" /></div>
            <span className="relative bg-card px-2 text-xs uppercase tracking-widest text-muted-foreground">or</span>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="username">Display name</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your in-game name" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

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
