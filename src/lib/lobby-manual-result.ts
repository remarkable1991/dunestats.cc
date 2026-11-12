export type LobbyManualRow = {
  placement: number;
  player_name: string;
  leader_name: string;
  points: number;
};

export type LobbyManualSeat = {
  name: string;
  playerKey: string | null;
};

/** Start a manual report in seat order; the reporter only needs to set ranks, leaders and VP. */
export function manualRowsFromSeats(seats: LobbyManualSeat[], unknownName = "Unknown player"): LobbyManualRow[] {
  return seats.slice(0, 4).map((seat, index) => ({
    placement: index + 1,
    player_name: seat.name !== unknownName ? seat.name : (seat.playerKey ?? ""),
    leader_name: "",
    points: 0,
  }));
}

/** Move one result to another rank and keep placements contiguous. */
export function reorderLobbyRows<T extends { placement: number }>(rows: T[], from: number, to: number): T[] {
  const sorted = [...rows].sort((a, b) => a.placement - b.placement);
  if (from === to || from < 0 || to < 0 || from >= sorted.length || to >= sorted.length) return sorted;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  return sorted.map((row, index) => ({ ...row, placement: index + 1 }));
}
