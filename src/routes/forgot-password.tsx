import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password · Strategy Arena" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setSent(true);
      toast.success("If that email exists, a reset link is on its way.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Card className="w-full max-w-md p-8 border-border/60 bg-card/80 backdrop-blur shadow-arena">
          <h1 className="font-display text-2xl text-center mb-1">Reset your password</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm">
                Check <span className="text-sand">{email}</span> for a message from us. Click the
                link inside to set a new password.
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't get it? Check spam, or{" "}
                <button className="text-sand hover:underline" onClick={() => setSent(false)}>
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handle} className="space-y-3">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <p className="text-sm text-center text-muted-foreground mt-4">
            <Link to="/auth" className="text-sand hover:underline">
              Back to sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
