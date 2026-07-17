import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { sendFeedback } from "@/lib/feedback.functions";

const DISCORD_URL = "https://discord.gg/XuvUmtcSDQ";
const DISCORD_DISMISS_KEY = "sa:hideDiscordBubble";
const FEEDBACK_DISMISS_KEY = "sa:hideFeedbackBubble";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.46 14.46 0 0 0-.677 1.392 18.27 18.27 0 0 0-5.762 0A14.16 14.16 0 0 0 9.44 3a19.74 19.74 0 0 0-3.76 1.37C2.057 9.94 1.067 15.36 1.56 20.7a19.91 19.91 0 0 0 6.073 3.07c.49-.66.927-1.36 1.305-2.1a12.94 12.94 0 0 1-2.057-.99c.173-.13.342-.26.505-.39a14.22 14.22 0 0 0 12.228 0c.165.14.334.27.506.4a13 13 0 0 1-2.062.99c.379.74.816 1.44 1.305 2.1a19.85 19.85 0 0 0 6.077-3.07c.578-6.15-.99-11.52-4.123-16.33ZM8.52 17.27c-1.21 0-2.205-1.12-2.205-2.49 0-1.38.97-2.5 2.205-2.5 1.235 0 2.227 1.13 2.205 2.5 0 1.37-.98 2.49-2.205 2.49Zm6.96 0c-1.21 0-2.205-1.12-2.205-2.49 0-1.38.97-2.5 2.205-2.5 1.235 0 2.227 1.13 2.205 2.5 0 1.37-.97 2.49-2.205 2.49Z" />
    </svg>
  );
}

function DismissX({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={
        "absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow-md ring-1 ring-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (className ?? "")
      }
    >
      <X className="size-3" />
    </button>
  );
}

export function FloatingBubbles() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasDiscordLinked, setHasDiscordLinked] = useState(false);
  const [discordDismissed, setDiscordDismissed] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const send = useServerFn(sendFeedback);

  // Hydration-safe: read localStorage after mount
  useEffect(() => {
    try {
      setDiscordDismissed(localStorage.getItem(DISCORD_DISMISS_KEY) === "1");
      setFeedbackDismissed(localStorage.getItem(FEEDBACK_DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const readAuth = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    setIsLoggedIn(!!user);
    const identities = user?.identities ?? [];
    setHasDiscordLinked(identities.some((i) => i.provider === "discord"));
  };

  useEffect(() => {
    readAuth();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      readAuth();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email;
      if (e) {
        setEmail(e);
        setEmailLocked(true);
      }
    });
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    setSubmitting(true);
    try {
      await send({ data: { email: email.trim(), message: message.trim() } });
      toast.success("Feedback sent successfully!");
      setMessage("");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const dismissDiscord = () => {
    setDiscordDismissed(true);
    try {
      localStorage.setItem(DISCORD_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const dismissFeedback = () => {
    setFeedbackDismissed(true);
    try {
      localStorage.setItem(FEEDBACK_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const hideDiscord = (isLoggedIn && hasDiscordLinked) || discordDismissed;
  const canDismissDiscord = isLoggedIn && !hasDiscordLinked;

  return (
    <>
      {!hideDiscord && (
        <div className="fixed bottom-6 left-6 z-50">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            className="relative inline-flex size-14 items-center justify-center rounded-full bg-[#5865F2] text-white shadow-lg shadow-black/30 transition-transform hover:scale-110 hover:bg-[#4752c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <DiscordIcon className="size-7" />
          </a>
          {canDismissDiscord && (
            <DismissX onClick={dismissDiscord} label="Hide Discord button" />
          )}
        </div>
      )}

      {!feedbackDismissed && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Send feedback"
            className="relative inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/30 transition-transform hover:scale-110 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageCircle className="size-6" />
          </button>
          {isLoggedIn && (
            <DismissX onClick={dismissFeedback} label="Hide feedback button" />
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Got a question or idea? We read every message.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fb-email">Email {emailLocked ? "" : "(optional)"}</Label>
              <Input
                id="fb-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={emailLocked}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb-message">Message</Label>
              <Textarea
                id="fb-message"
                required
                rows={5}
                placeholder="Type your question or feedback here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitting}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || !message.trim()}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send className="size-4" /> Send feedback
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
