import { supabase } from "@/integrations/supabase/client";

/** Leaders picked by more than one player (each leader is unique in a game). */
export function duplicateLeaders(leaders: Array<string | null | undefined>): string[] {
  const seen = new Map<string, number>();
  for (const l of leaders) {
    const v = (l ?? "").trim();
    if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([l]) => l);
}

/** Flag a match as "Needs review" with a reason; any signed-in user may call it. */
export async function reportMatchForReview(gameId: string, reason: string): Promise<void> {
  const client = supabase as unknown as {
    rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
  const { error } = await client.rpc("report_match_for_review", { p_game_id: gameId, p_reason: reason });
  if (error) throw new Error(error.message);
}
