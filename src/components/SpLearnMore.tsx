import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle } from "lucide-react";

export function SpLearnMore({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <HelpCircle className="size-4" />
          Learn More
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Strategy Points (SP)</DialogTitle>
          <DialogDescription>
            SP is separate from Elo. Elo tracks your skill at winning games. SP
            tracks your engagement with the community — playing, uploading,
            verifying, and competing in tournaments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <section>
            <h4 className="font-display text-sand mb-1">Two tracks</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><span className="text-foreground">Lifetime SP</span> — permanent legacy, never resets.</li>
              <li><span className="text-foreground">Seasonal SP</span> — resets every 3 months.</li>
            </ul>
          </section>
          <section>
            <h4 className="font-display text-sand mb-1">How you earn it</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Daily check-in: <span className="text-foreground">+5 SP</span></li>
              <li>Match reporting & verification: <span className="text-foreground">+20 SP</span> — <em>uploading and verifying give the identical reward, so there's no rush to log first.</em></li>
              <li>Tournament round win: <span className="text-foreground">+30 SP</span></li>
              <li>Completing all preliminary rounds: <span className="text-foreground">+100 SP</span></li>
              <li>Reaching Semi-Finals: <span className="text-foreground">+150 SP</span></li>
              <li>Reaching Grand Finals: <span className="text-foreground">+300 SP</span></li>
              <li>Winning Grand Finals: <span className="text-foreground">+500 SP</span></li>
              <li>Referral sign-up: <span className="text-foreground">+100 SP</span> (referrer) / <span className="text-foreground">+50 SP</span> (new user)</li>
              <li>Referred friend reaches 100 lifetime SP: <span className="text-foreground">+500 SP</span> jackpot</li>
            </ul>
          </section>
          <section>
            <h4 className="font-display text-sand mb-1">Legacy data</h4>
            <p className="text-muted-foreground">
              Matches and tournaments dated before <span className="text-foreground">July 1, 2026</span> are backfilled at
              10% value and count only toward Lifetime SP — Season 1 starts fresh.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
