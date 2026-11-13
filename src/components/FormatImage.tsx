import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Image as ImageIcon } from "lucide-react";

/** Format artwork behind a "Show format" button; `preview` shows an inline thumbnail (admin editor). */
export function FormatImage({ url, label = "Format", preview = false }: { url: string | null | undefined; label?: string; preview?: boolean }) {
  if (!url) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        {preview ? (
          <button type="button" className="group block rounded-md border border-border overflow-hidden w-full max-w-xs hover:border-primary transition-colors" aria-label={`View ${label} image`}>
            <img src={url} alt={label} loading="lazy" className="w-full h-auto object-contain bg-muted" />
            <span className="block text-[11px] text-muted-foreground py-1 group-hover:text-foreground">Click to view format</span>
          </button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 w-fit">
            <ImageIcon className="size-3.5" /> Show format
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogTitle>{label}</DialogTitle>
        <img src={url} alt={label} className="w-full h-auto max-h-[75vh] object-contain" />
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Open original <ExternalLink className="size-3.5" />
        </a>
      </DialogContent>
    </Dialog>
  );
}
