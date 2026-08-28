/** Shared types + helpers for the match telemetry board overlay. */

export type TelemetryPlayer = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
  spice: number | null;
  solaris: number | null;
  water: number | null;
  is_leaver: boolean | null;
  player_slot: number | null;
  turn_order: number | null;
  player_color: string | null;
  has_first_player: boolean | null;
  has_high_council: boolean | null;
  has_swordmaster: boolean | null;
  emperor_level?: number | null;
  emperor_alliance?: boolean | null;
  spacing_guild_level?: number | null;
  spacing_guild_alliance?: boolean | null;
  bene_gesserit_level?: number | null;
  bene_gesserit_alliance?: boolean | null;
  fremen_level?: number | null;
  fremen_alliance?: boolean | null;
};

export type FactionKey = "emperor" | "spacing_guild" | "bene_gesserit" | "fremen";

export const FACTION_LEVEL_KEYS = {
  emperor: "emperor_level",
  spacing_guild: "spacing_guild_level",
  bene_gesserit: "bene_gesserit_level",
  fremen: "fremen_level",
} as const;

export const FACTION_ALLIANCE_KEYS = {
  emperor: "emperor_alliance",
  spacing_guild: "spacing_guild_alliance",
  bene_gesserit: "bene_gesserit_alliance",
  fremen: "fremen_alliance",
} as const;

/** Player payload for the `update_match_details` RPC, including faction influence. */
export function telemetryPayload(p: TelemetryPlayer) {
  return {
    player_name: p.player_name,
    spice: p.spice,
    solaris: p.solaris,
    water: p.water,
    is_leaver: p.is_leaver ?? false,
    player_color: p.player_color,
    player_slot: p.player_slot,
    turn_order: p.turn_order,
    has_first_player: p.has_first_player,
    has_high_council: p.has_high_council,
    has_swordmaster: p.has_swordmaster,
    emperor_level: p.emperor_level ?? null,
    emperor_alliance: p.emperor_alliance ?? null,
    spacing_guild_level: p.spacing_guild_level ?? null,
    spacing_guild_alliance: p.spacing_guild_alliance ?? null,
    bene_gesserit_level: p.bene_gesserit_level ?? null,
    bene_gesserit_alliance: p.bene_gesserit_alliance ?? null,
    fremen_level: p.fremen_level ?? null,
    fremen_alliance: p.fremen_alliance ?? null,
  };
}


export const PLAYER_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  blue: "#3b82f6",
};

export function colorHex(c: string | null | undefined): string {
  return PLAYER_COLORS[(c ?? "").toLowerCase().trim()] ?? "#8b8b8b";
}

/**
 * The slot that started the final round, derived from the first-player slot
 * and the round the game ended on.
 */
export function startSlotFor(winningSlot: number, round: number): number {
  return (((winningSlot - 1 - (round - 1)) % 4) + 4) % 4 + 1;
}

/** Turn order (1-4) for a player slot, given the round's starting slot. */
export function turnOrderFor(slot: number, startSlot: number): number {
  return (((slot - startSlot) % 4) + 4) % 4 + 1;
}

/**
 * Assign `has_first_player` to exactly one slot and recompute every
 * player's turn order from that slot and the end round.
 */
export function applyFirstPlayer<T extends TelemetryPlayer>(
  players: T[],
  winningSlot: number,
  endRound: number | null,
): T[] {
  const round = endRound && endRound > 0 ? endRound : 1;
  const startSlot = startSlotFor(winningSlot, round);
  return players.map((p) => {
    const slot = p.player_slot;
    return {
      ...p,
      has_first_player: slot === winningSlot,
      turn_order: slot ? turnOrderFor(slot, startSlot) : p.turn_order,
    };
  });
}
