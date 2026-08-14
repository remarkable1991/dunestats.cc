import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type RosterSeat = {
  id: string;
  player_name: string;
  discord_username: string | null;
  is_backup?: boolean | null;
};

/**
 * Admin-only roster editor: swap or replace any of the 4 players at a table.
 * A replacement who already plays elsewhere in this tournament is flagged as a
 * backup, so the game does not count toward their own standings.
 */
export function RosterEditDialog({
  open,
  onOpenChange,
  tournamentNum,
  roundType,
  tableIdentifier,
  seats,
  existingPlayers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentNum: number;
  roundType: string;
  tableIdentifier: string;
  seats: RosterSeat[];
  /** All player names already competing in this tournament (lower-cased). */
  existingPlayers: Set<string>;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<RosterSeat[]>(seats);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(seats);
  }, [open, seats]);

  const isBackupFor = (seat: RosterSeat, original: RosterSeat | undefined) => {
    const name = seat.player_name.trim().toLowerCase();
    if (!name) return false;
    const changed = name !== (original?.player_name ?? "").trim().toLowerCase();
    if (!changed) return !!seat.is_backup;
    // Existing tournament player brought in as a substitute → backup.
    return existingPlayers.has(name);
  };

  const save = async () => {
    if (draft.some((d) => !d.player_name.trim())) return toast.error("Every seat needs a player name.");
    setSaving(true);
    try {
      const payload = draft.map((d) => {
        const original = seats.find((s) => s.id === d.id);
        return {
          id: d.id,
          player_name: d.player_name.trim(),
          discord_username: (d.discord_username ?? "").trim(),
          is_backup: isBackupFor(d, original),
        };
      });
      const { error } = await supabase.rpc("admin_set_table_roster", {
        p_tournament_num: tournamentNum,
        p_round_type: roundType,
        p_table_identifier: tableIdentifier,
        p_players: payload,
      });
      if (error) throw error;
      toast.success("Roster updated");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the roster");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit roster · {roundType} · {tableIdentifier}
          </DialogTitle>
          <DialogDescription>
            Replace any player at this table. A substitute who already plays in this tournament is marked as a backup
            and their result here will not count toward their own standings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {draft.map((seat, i) => {
            const original = seats.find((s) => s.id === seat.id);
            const backup = isBackupFor(seat, original);
            return (
              <div key={seat.id} className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-xs">
                    Seat {i + 1}
                    {backup && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 text-[10px] text-sky-300">
                        <Shield className="size-2.5" /> Backup
                      </span>
                    )}
                  </Label>
                  <Input
                    value={seat.player_name}
                    onChange={(e) =>
                      setDraft((d) => d.map((s) => (s.id === seat.id ? { ...s, player_name: e.target.value } : s)))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Discord</Label>
                  <Input
                    value={seat.discord_username ?? ""}
                    onChange={(e) =>
                      setDraft((d) => d.map((s) => (s.id === seat.id ? { ...s, discord_username: e.target.value } : s)))
                    }
                  />
                </div>
              </div>
            );
          })}
          <Button className="w-full" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Save roster
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
