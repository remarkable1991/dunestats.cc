import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Youtube, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Extracts the YouTube video id from watch, youtu.be, shorts, embed and live links. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

export function MatchVideo({
  gameId,
  url,
  canEdit,
  onSaved,
}: {
  gameId: string;
  url: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const id = youtubeId(url);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (next: string | null) => {
    if (next && !youtubeId(next)) {
      toast.error("That doesn't look like a YouTube video link.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_game_youtube_url" as never, { p_game_id: gameId, p_url: next } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(next ? "Video saved" : "Video removed");
    setEditing(false);
    onSaved();
  };

  if (!id && !canEdit) return null;

  return (
    <Card className="mb-6 p-3 border-border/60 bg-card/70 space-y-3">
      {id && (
        <div className="relative w-full aspect-video rounded overflow-hidden bg-background">
          <iframe
            className="absolute inset-0 size-full"
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title="Match video"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {canEdit &&
        (editing || !id ? (
          <div className="flex flex-wrap gap-2 items-center">
            <Youtube className="size-4 text-coral" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste a YouTube link…"
              className="h-8 flex-1 min-w-48"
            />
            <Button size="sm" disabled={busy || !value.trim()} onClick={() => void save(value.trim())}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save video"}
            </Button>
            {id && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>
                Remove
              </Button>
            )}
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Change video
          </Button>
        ))}
    </Card>
  );
}

export function SpoilerToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sand/40 bg-sand/10 px-3 py-2 text-sm">
      <span>{hidden ? "Results are hidden so the video isn't spoiled." : "Results are visible."}</span>
      <Button size="sm" variant="outline" onClick={onToggle}>
        {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        {hidden ? "Reveal results" : "Hide results"}
      </Button>
    </div>
  );
}
