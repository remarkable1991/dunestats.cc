import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

type PwRow = {
  id: number;
  mode: string | null;
  board_type: string | null;
  expansions: string[] | null;
  message_text: string | null;
  lobby_password: string | null;
  guest_players?: string[] | null;
};

/** Saves only the password; passes the current guests so the roster is never cleared. */
export async function setLobbyPassword(row: PwRow, password: string) {
  const { data, error } = await supabase.rpc("lfg_update_lobby", {
    p_id: row.id,
    p_mode: row.mode ?? "",
    p_board: row.board_type ?? "",
    p_expansions: row.expansions ?? [],
    p_notes: row.message_text ?? "",
    p_password: password,
    p_expires_minutes: 0,
    p_guest_players: row.guest_players ?? [],
    p_remove_web_ids: [],
    p_remove_discord_ids: [],
  });
  const res = data as { ok?: boolean; error?: string } | null;
  if (error || !res?.ok) throw new Error(res?.error ?? error?.message ?? "Could not save password");
}

/** Fetches a freshly created lobby and gives it the default sa{id} password. */
export async function applyDefaultPassword(id: number) {
  const { data } = await supabase
    .from("active_async_matches")
    .select("id,mode,board_type,expansions,message_text,lobby_password,guest_players")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.lobby_password) return;
  await setLobbyPassword(data as PwRow, `sa${id}`);
}

export function LobbyPasswordRow({ row, canEdit, onSaved }: { row: PwRow; canEdit: boolean; onSaved?: () => void }) {
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const pw = row.lobby_password;

  const save = async () => {
    setBusy(true);
    try {
      await setLobbyPassword(row, value.trim());
      toast.success(value.trim() ? "Password saved" : "Password removed");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">Password</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            maxLength={40}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            placeholder={`sa${row.id}`}
            className="h-7 w-32 rounded border border-input bg-background px-2 font-mono text-sm"
          />
          <button disabled={busy} onClick={() => void save()} aria-label="Save password"><Check className="size-4" /></button>
          <button onClick={() => setEditing(false)} aria-label="Cancel"><X className="size-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{pw ? (reveal ? pw : "••••••") : "None"}</span>
          {pw && (
            <>
              <button onClick={() => setReveal((v) => !v)} aria-label="Reveal password">
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <button
                aria-label="Copy password"
                onClick={() => {
                  void navigator.clipboard.writeText(pw);
                  toast.success("Password copied");
                }}
              >
                <Copy className="size-4" />
              </button>
            </>
          )}
          {canEdit && (
            <button aria-label="Set password" onClick={() => { setValue(pw ?? `sa${row.id}`); setEditing(true); }}>
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
