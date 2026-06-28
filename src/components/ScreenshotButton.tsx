import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Renders a small icon button. On click, opens a lightbox showing the
 * match screenshot. Accepts either a full URL or a storage path in the
 * private `match-screenshots` bucket — a signed URL is fetched on demand.
 */
export function ScreenshotButton({ url, label = "View screenshot" }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && !resolved) {
      if (/^https?:\/\//i.test(url)) { setResolved(url); return; }
      setLoading(true);
      const { data } = await supabase.storage
        .from("match-screenshots")
        .createSignedUrl(url, 60 * 60);
      setResolved(data?.signedUrl ?? null);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-sand hover:text-sand hover:bg-sand/10"
          title={label}
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          <ImageIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur-md">
        {loading || !resolved ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <img src={resolved} alt="Match screenshot" className="w-full h-auto rounded max-h-[80vh] object-contain" />
        )}
      </DialogContent>
    </Dialog>
  );
}