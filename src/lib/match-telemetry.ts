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
};

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
