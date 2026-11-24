export type UploaderRatingClaim = { claimed_by: string | null; display_name: string | null; games_played?: number | null };
export type UploaderMapClaim = { claimed_by: string | null; display_name: string | null; player_key: string | null };
export type UploaderProfile = { id: string; username: string | null };

/** Claimed ratings first (most games), then Discord mappings, then account usernames. */
export function resolveUploaderNames(ratings: UploaderRatingClaim[], maps: UploaderMapClaim[], profiles: UploaderProfile[]): Record<string, string> {
  const out: Record<string, string> = {};
  const best: Record<string, number> = {};
  for (const r of ratings) {
    const name = r.display_name?.trim();
    if (!r.claimed_by || !name) continue;
    const games = r.games_played ?? 0;
    if (!(r.claimed_by in best) || games > best[r.claimed_by]!) { out[r.claimed_by] = name; best[r.claimed_by] = games; }
  }
  for (const m of maps) {
    const name = m.display_name?.trim() || m.player_key?.trim();
    if (m.claimed_by && name && !out[m.claimed_by]) out[m.claimed_by] = name;
  }
  for (const p of profiles) {
    const name = p.username?.trim();
    if (name && !out[p.id]) out[p.id] = name;
  }
  return out;
}
