/** Shared per-game Tournament Points (TP) calculation. */
export type TpSeat = {
  id: string | number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  placement: number | null;
  points: number | null;
  is_backup?: boolean | null;
};

export type TpEntry = {
  id: string | number;
  round: string;
  table: string;
  player: string;
  isBackup: boolean;
  placement: number;
  vp: number;
  winnerVp: number;
  /** VP margin vs. the reference player (2nd for the winner, the winner for others). */
  margin: number;
  base: number;
  tp: number;
};

const BASES = [20, 15, 10, 5];

/** TP for every seat in finished 4-player tables, keyed by seat id. */
export function computeSeatTps<T extends TpSeat>(rows: T[]): Map<string | number, TpEntry> {
  const tables = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.round_type}__${r.table_identifier}`;
    if (!tables.has(k)) tables.set(k, []);
    tables.get(k)!.push(r);
  }
  const out = new Map<string | number, TpEntry>();
  for (const t of tables.values()) {
    const ranked = t
      .filter((r) => r.placement && r.points != null)
      .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
    if (ranked.length < 4) continue;
    const vps = ranked.map((r) => r.points ?? 0);
    ranked.slice(0, 4).forEach((r, i) => {
      const margin = i === 0 ? vps[0] - vps[1] : vps[0] - vps[i];
      const tp = Math.max(0, i === 0 ? 20 + margin : BASES[i] - margin);
      out.set(r.id, {
        id: r.id,
        round: r.round_type,
        table: r.table_identifier,
        player: r.player_name,
        isBackup: !!r.is_backup,
        placement: r.placement ?? i + 1,
        vp: vps[i],
        winnerVp: vps[0],
        margin,
        base: BASES[i],
        tp,
      });
    });
  }
  return out;
}

export function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}
