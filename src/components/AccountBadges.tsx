import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, MessageCircle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type DiscordInfo = { handle: string | null; claimed: boolean };

/** Batch-loads Discord links for the visible player keys only. */
export function useDiscordLinks(keys: string[]) {
  const [map, setMap] = useState<Record<string, DiscordInfo>>({});
  const sig = [...keys].sort().join("|");
  useEffect(() => {
    if (!keys.length) return;
    let alive = true;
    void supabase
      .from("player_discord_map")
      .select("player_key,discord_username,username,discord_user_id,claimed_by")
      .in("player_key", keys)
      .then(({ data }) => {
        if (!alive) return;
        const out: Record<string, DiscordInfo> = {};
        for (const r of data ?? []) {
          if (!r.player_key || !r.discord_user_id) continue;
          out[r.player_key.toLowerCase()] = {
            handle: r.discord_username || r.username || null,
            claimed: !!r.claimed_by,
          };
        }
        setMap((m) => ({ ...m, ...out }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return map;
}

export function AccountBadges({
  playerKey,
  webClaimed,
  discord,
}: {
  playerKey: string;
  webClaimed: boolean;
  discord?: DiscordInfo;
}) {
  const web = webClaimed || !!discord?.claimed;
  if (!web && !discord) {
    return (
      <Link
        to="/claim"
        search={{ player: playerKey }}
        className="inline-flex items-center gap-1 text-xs text-coral hover:text-sand underline-offset-2 hover:underline"
      >
        <UserPlus className="size-3.5" /> Claim
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 justify-end flex-wrap">
      {discord && (
        <span
          title={discord.handle ? `Discord: @${discord.handle}` : "Linked to Discord"}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
        >
          <MessageCircle className="size-3" />
          <span className="hidden sm:inline max-w-[9rem] truncate">{discord.handle ? `@${discord.handle}` : "Discord"}</span>
        </span>
      )}
      {web && (
        <span
          title="Website account claimed"
          className="inline-flex items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[11px] text-teal"
        >
          <BadgeCheck className="size-3" />
          <span className="hidden sm:inline">Website</span>
        </span>
      )}
    </span>
  );
}
