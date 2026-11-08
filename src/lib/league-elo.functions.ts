import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Applies seasonal League Elo once for a League lobby's linked result. Safe to call repeatedly. */
export const applyLeagueEloForLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyLinkedLeagueElo } = await import("@/lib/league-elo.server");
    return applyLinkedLeagueElo(supabaseAdmin, data.lobbyId);
  });
