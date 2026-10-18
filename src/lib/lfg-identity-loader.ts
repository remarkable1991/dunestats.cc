import { supabase } from "@/integrations/supabase/client";
import { resolveLobbyIdentities } from "@/lib/lfg-identities";

export async function loadLobbyIdentities(ids: string[]) {
  const { data: maps, error } = await supabase.from("player_discord_map")
    .select("discord_user_id,player_key,display_name,discord_username").in("discord_user_id", ids);
  if (error) throw error;
  const missing = ids.filter((id) => !maps?.some((map) => map.discord_user_id === id && map.player_key));
  const { data: members } = missing.length ? await supabase.from("discord_guild_members")
    .select("discord_user_id,suggested_player_key,display_name,discord_username,global_name").in("discord_user_id", missing) : { data: [] };
  return resolveLobbyIdentities(ids, maps ?? [], members ?? []);
}