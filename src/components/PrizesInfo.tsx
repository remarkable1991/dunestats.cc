import { useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  summary: string | null;
  details: string | null;
  title?: string;
};

/** Shows a one-line prize summary with an optional "See more" dialog for the full details. */
export function PrizesInfo({ summary, details, title = "Prizes" }: Props) {
  const [open, setOpen] = useState(false);
  const short = summary?.trim();
  const full = details?.trim();
  if (!short && !full) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-sand/30 bg-sand/5 px-3 py-2">
      <Gift className="size-4 text-sand shrink-0" />
      <span className="text-sm text-foreground/90">{short || title}</span>
      {full && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="link" size="sm" className="h-auto p-0 text-sand">
              See more
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">{title}</DialogTitle>
              {short && <DialogDescription>{short}</DialogDescription>}
            </DialogHeader>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed max-h-[60vh] overflow-y-auto">
              {full}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
