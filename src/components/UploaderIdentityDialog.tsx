import { useCallback, useRef, useState } from "react";
import { BadgeCheck, Check, Loader2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmUploadedIdentity } from "@/lib/uploader-identity.functions";
import { invalidateNameNormalizationCache } from "@/lib/name-normalize";
import {
  preselectUploaderSeat,
  shouldPromptForUploader,
  suggestUploaderCanonicalName,
  uploadNameKey,
  type UploaderClaimedName,
  type UploaderSeatCandidate,
} from "@/lib/uploader-identity";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type UploadIdentityConfirmation = {
  detectedName: string;
  confirmedName: string;
  claim: boolean;
};

type PromptState = {
  candidates: UploaderSeatCandidate[];
  claimedNames: UploaderClaimedName[];
};

type RatingRow = {
  player_key: string;
  display_name: string;
  claimed_by: string | null;
  games_played: number;
  game_version: "base" | "ix" | "uprising" | "overall";
};

function claimedNamesFrom(rows: RatingRow[]): UploaderClaimedName[] {
  const byKey = new Map<string, UploaderClaimedName & { overall: boolean }>();
  for (const row of rows) {
    const key = uploadNameKey(row.player_key);
    const previous = byKey.get(key);
    const overall = row.game_version === "overall";
    if (!previous || (overall && !previous.overall) || row.games_played > previous.gamesPlayed) {
      byKey.set(key, {
        key,
        name: row.display_name || row.player_key,
        gamesPlayed: Math.max(previous?.gamesPlayed ?? 0, row.games_played),
        overall: overall || previous?.overall || false,
      });
    }
  }
  return [...byKey.values()].map(({ key, name, gamesPlayed }) => ({ key, name, gamesPlayed }));
}

function UploaderIdentityDialog({
  prompt,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: {
  prompt: PromptState;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: UploadIdentityConfirmation) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(() => preselectUploaderSeat(prompt.candidates));
  const [canonicalKey, setCanonicalKey] = useState("none");
  const [claim, setClaim] = useState(true);
  const selected = prompt.candidates.find((candidate) => candidate.key === selectedKey) ?? null;
  const suggested = selected ? suggestUploaderCanonicalName(selected.detectedName, prompt.claimedNames) : null;
  const effectiveCanonical = canonicalKey === "none" ? null : prompt.claimedNames.find((name) => name.key === canonicalKey) ?? null;

  const chooseSeat = (candidate: UploaderSeatCandidate) => {
    setSelectedKey(candidate.key);
    setClaim(true);
    setCanonicalKey(suggestUploaderCanonicalName(candidate.detectedName, prompt.claimedNames)?.key ?? "none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="size-5 text-primary" /> Which player were you?
          </DialogTitle>
          <DialogDescription>
            None of your claimed in-game names matched this endboard. Confirm your seat, or continue as a spectator or admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Players on this endboard">
          {prompt.candidates.map((candidate) => {
            const active = selectedKey === candidate.key;
            return (
              <button
                key={`${candidate.key}-${candidate.placement}`}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={candidate.takenByAnotherAccount || saving}
                onClick={() => chooseSeat(candidate)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                  active ? "border-primary bg-primary/10" : "border-border/60 bg-background/40 hover:border-primary/60"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 font-display text-sm">
                  {active ? <Check className="size-4 text-primary" /> : candidate.placement}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{candidate.detectedName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {candidate.takenByAnotherAccount
                      ? "Already claimed by another account"
                      : candidate.gamesPlayed > 0
                        ? `${candidate.gamesPlayed} recorded games · unclaimed`
                        : "Unclaimed name"}
                  </span>
                </span>
                {!candidate.takenByAnotherAccount && <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        {selected && prompt.claimedNames.length > 0 && (
          <div className="space-y-2 rounded-md border border-border/50 bg-background/30 p-3">
            <Label htmlFor="upload-canonical-name">Is this a screenshot typo of one of your claimed names?</Label>
            <Select value={canonicalKey} onValueChange={setCanonicalKey} disabled={saving}>
              <SelectTrigger id="upload-canonical-name">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No — use “{selected.detectedName}”</SelectItem>
                {prompt.claimedNames.map((name) => (
                  <SelectItem key={name.key} value={name.key}>{name.name} · {name.gamesPlayed} games</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {effectiveCanonical ? (
              <p className="text-xs text-muted-foreground">
                The result will use <strong>{effectiveCanonical.name}</strong>, and “{selected.detectedName}” will be remembered as the same player.
              </p>
            ) : suggested ? (
              <p className="text-xs text-muted-foreground">The spelling looks similar to {suggested.name}; choose it above only if that is you.</p>
            ) : null}
          </div>
        )}

        {selected && !effectiveCanonical && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/50 bg-background/30 p-3 text-sm">
            <Checkbox checked={claim} onCheckedChange={(checked) => setClaim(!!checked)} disabled={saving} className="mt-0.5" />
            <span>
              Claim <strong>{selected.detectedName}</strong> for my account
              <span className="mt-1 block text-xs text-muted-foreground">Future uploads will recognise you automatically and this upload will show your player name.</span>
            </span>
          </label>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <Users className="size-4" /> I'm a spectator / admin
          </Button>
          <Button
            type="button"
            disabled={!selected || selected.takenByAnotherAccount || saving}
            onClick={() => {
              if (!selected) return;
              onConfirm({
                detectedName: selected.detectedName,
                confirmedName: effectiveCanonical?.name ?? selected.detectedName,
                claim: !effectiveCanonical && claim,
              });
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Confirm player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shared upload prompt and post-save identity persistence for /upload, /tournament and /lfg. */
export function useUploaderIdentity(userId: string | null) {
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<UploadIdentityConfirmation | null>(null);
  const requestRef = useRef(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const correctionRef = useRef<(detectedName: string, canonicalName: string) => void>(() => {});

  const reset = useCallback(() => {
    requestRef.current += 1;
    setPrompt(null);
    setOpen(false);
    setConfirmation(null);
    setSaving(false);
  }, []);

  const offer = useCallback(async (
    rows: Array<{ player_name: string; placement: number }>,
    onCanonicalName: (detectedName: string, canonicalName: string) => void,
  ) => {
    const request = ++requestRef.current;
    correctionRef.current = onCanonicalName;
    setConfirmation(null);
    setPrompt(null);
    setOpen(false);
    const detectedNames = [...new Set(rows.map((row) => row.player_name.trim()).filter(Boolean))];
    if (!userId || !detectedNames.length) return;

    const uid = userIdRef.current;
    if (!uid) return;
    const keys = detectedNames.map(uploadNameKey);
    const [ownResult, detectedResult] = await Promise.all([
      supabase.from("player_ratings").select("player_key,display_name,claimed_by,games_played,game_version").eq("claimed_by", uid),
      supabase.from("player_ratings").select("player_key,display_name,claimed_by,games_played,game_version").in("player_key", keys),
    ]);
    if (request !== requestRef.current) return;
    if (ownResult.error || detectedResult.error) {
      console.error("Could not check uploader identity", ownResult.error ?? detectedResult.error);
      return;
    }

    const ownRows = (ownResult.data ?? []) as RatingRow[];
    const detectedRows = (detectedResult.data ?? []) as RatingRow[];
    const claimedNames = claimedNamesFrom(ownRows);
    if (!shouldPromptForUploader(detectedNames, claimedNames)) return;

    const candidates = rows.filter((row) => row.player_name.trim()).map((row) => {
      const key = uploadNameKey(row.player_name);
      const ratings = detectedRows.filter((rating) => uploadNameKey(rating.player_key) === key);
      return {
        detectedName: row.player_name.trim(),
        placement: row.placement,
        key,
        takenByAnotherAccount: ratings.some((rating) => rating.claimed_by && rating.claimed_by !== uid),
        gamesPlayed: ratings.reduce((best, rating) => Math.max(best, rating.games_played), 0),
      };
    });
    setPrompt({ candidates, claimedNames });
    setOpen(true);
  }, []);

  const confirmForGame = useCallback(async (gameId: string) => {
    if (!confirmation) return true;
    setSaving(true);
    try {
      const result = await confirmUploadedIdentity({ data: { gameId, ...confirmation } });
      if (result.kind === "alias") {
        invalidateNameNormalizationCache();
        toast.success(`Screenshot spelling linked to ${result.playerName}.`);
      } else if (result.kind === "claimed") toast.success(`${result.playerName} is now linked to your account.`);
      setConfirmation(null);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Match saved, but your player identity could not be confirmed.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [confirmation]);

  const dialog = prompt ? (
    <UploaderIdentityDialog
      key={prompt.candidates.map((candidate) => `${candidate.key}:${candidate.placement}`).join("|")}
      prompt={prompt}
      open={open}
      saving={saving}
      onOpenChange={setOpen}
      onConfirm={(choice) => {
        setConfirmation(choice);
        if (uploadNameKey(choice.detectedName) !== uploadNameKey(choice.confirmedName)) {
          correctionRef.current(choice.detectedName, choice.confirmedName);
        }
        setOpen(false);
      }}
    />
  ) : null;

  return { offer, confirmForGame, reset, dialog, hasConfirmation: !!confirmation };
}
