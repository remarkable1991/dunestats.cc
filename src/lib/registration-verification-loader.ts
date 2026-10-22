import { supabase } from "@/integrations/supabase/client";
import type { RegistrationGuildMember, RegistrationMapping, RegistrationRating } from "@/lib/registration-verification";

// Page through every source; Supabase's response cap must not turn known players into false negatives.
async function allPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await read(from, from + pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) return rows;
  }
}

export async function loadRegistrationVerification() {
  const [mappings, members, ratings] = await Promise.all([
    allPages<RegistrationMapping>((from, to) => supabase.from("player_discord_map")
      .select("discord_user_id,discord_username,player_key,display_name").order("id").range(from, to)),
    allPages<RegistrationGuildMember>((from, to) => supabase.from("discord_guild_members")
      .select("discord_user_id,discord_username,has_verified_map").order("discord_user_id").range(from, to)),
    allPages<RegistrationRating>((from, to) => supabase.from("player_ratings")
      .select("player_key,display_name,games_played").eq("game_version", "overall").order("player_key").range(from, to)),
  ]);
  return { mappings, members, ratings };
}