import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdentityInput = z.object({
  gameId: z.string().uuid(),
  detectedName: z.string().trim().min(1).max(64),
  confirmedName: z.string().trim().min(1).max(64),
  claim: z.boolean(),
});

const key = (name: string) => name.trim().toLowerCase();

/**
 * Finishes the identity choice made before an upload. The authenticated user
 * must own the game, the confirmed IGN must be in its results, and an OCR alias
 * may point only at an IGN already claimed by that same user.
 */
export const confirmUploadedIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(IdentityInput)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const detectedKey = key(data.detectedName);
    const confirmedKey = key(data.confirmedName);

    const [{ data: game, error: gameError }, { data: results, error: resultsError }] = await Promise.all([
      context.supabase.from("games").select("id,created_by").eq("id", data.gameId).maybeSingle(),
      context.supabase.from("game_results").select("player_name").eq("game_id", data.gameId),
    ]);
    if (gameError || resultsError || !game || game.created_by !== userId) {
      throw new Error("This upload does not belong to your account.");
    }
    if (!(results ?? []).some((row) => key(row.player_name) === confirmedKey)) {
      throw new Error("The confirmed player is not in this match.");
    }

    if (detectedKey !== confirmedKey) {
      const [{ data: canonicalRows, error: canonicalError }, { data: detectedRows, error: detectedError }] = await Promise.all([
        context.supabase.from("player_ratings").select("player_key,display_name,claimed_by").eq("player_key", confirmedKey),
        context.supabase.from("player_ratings").select("player_key,claimed_by").eq("player_key", detectedKey),
      ]);
      if (canonicalError || detectedError) throw new Error("Could not verify the claimed player name.");
      if (!(canonicalRows ?? []).some((row) => row.claimed_by === userId)) {
        throw new Error("You can link a screenshot spelling only to your own claimed name.");
      }
      if ((detectedRows ?? []).some((row) => row.claimed_by && row.claimed_by !== userId)) {
        throw new Error("This screenshot name is already claimed by another account.");
      }

      const canonicalName = canonicalRows?.find((row) => row.display_name)?.display_name ?? data.confirmedName;
      const { data: aliases, error: aliasReadError } = await context.supabase
        .from("player_name_aliases")
        .select("id,old_name,canonical_name")
        .ilike("old_name", data.detectedName)
        .ilike("canonical_name", canonicalName)
        .limit(20);
      if (aliasReadError) throw new Error("Could not check the existing name correction.");
      const exists = (aliases ?? []).some(
        (alias) => key(alias.old_name) === detectedKey && key(alias.canonical_name) === confirmedKey,
      );
      if (!exists) {
        // Alias writes stay privileged; the ownership and match checks above authorize this one self-service correction.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("player_name_aliases").insert({
          old_name: data.detectedName,
          canonical_name: canonicalName,
          created_by: userId,
        });
        if (error) throw new Error("The match was saved, but the name correction could not be remembered.");
      }
      return { kind: "alias" as const, playerName: canonicalName };
    }

    if (data.claim) {
      const { error } = await context.supabase.rpc("claim_player_name", {
        p_player_key: confirmedKey,
        p_reset: false,
      });
      if (error) throw new Error(error.message);
      return { kind: "claimed" as const, playerName: data.confirmedName };
    }

    return { kind: "confirmed" as const, playerName: data.confirmedName };
  });
