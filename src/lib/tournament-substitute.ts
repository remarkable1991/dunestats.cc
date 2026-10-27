import { discordEpoch, parseSuggestedSlots } from "@/lib/match-schedules";

export type SubSchedule = {
  player_names: string[] | null;
  player_discord_ids?: string[] | null;
  votes?: unknown;
  suggested_slots?: unknown;
};

export type SlotTally = { label: string; time_text: string; epoch: number | null; yes: number; of: number };

const voteMap = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const labelsOf = (raw: unknown) => (Array.isArray(raw) ? raw.map(String) : []);

/** Votes per suggested slot from the players who stay at the table. */
export function remainingSlotTallies(s: SubSchedule, oldIndex: number): SlotTally[] {
  const ids = (s.player_discord_ids ?? []).map((x) => (x == null ? "" : String(x)));
  const votes = voteMap(s.votes);
  const remaining = ids.filter((_, i) => i !== oldIndex);
  return parseSuggestedSlots(s.suggested_slots).map((slot) => ({
    ...slot,
    epoch: discordEpoch(slot.time_text),
    yes: remaining.filter((id) => id && labelsOf(votes[id]).includes(slot.label)).length,
    of: remaining.length,
  }));
}

export function subRequestText(p: { tournamentNum: number; roundType: string; table: string; matchCode: string | null; tallies: SlotTally[] }) {
  const head = `🔁 **Substitute needed — Tournament #${p.tournamentNum} — ${p.roundType} ${p.table}${p.matchCode ? ` (${p.matchCode})` : ""}**`;
  const lines = p.tallies.map((t) => {
    const when = t.epoch ? `<t:${t.epoch}:F> (<t:${t.epoch}:R>)` : t.time_text;
    const tag = t.yes === t.of && t.of > 0 ? `${t.yes}/${t.of} remaining players available!` : `${t.yes}/${t.of} available`;
    return `• ${t.label} ${when} (${tag})`;
  });
  return [head, "", "Suggested times:", ...(lines.length ? lines : ["• No suggested times yet"]), "", "Reply or DM a Tournament Host if you can sub in for one of these times!"].join("\n");
}

const HALF = 1800;
const toBlocks = (av: string[]) => {
  const out = new Set<number>();
  for (const iso of av) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) out.add(Math.floor(t / 1000 / HALF));
  }
  return out;
};

export type Fit = "perfect" | "partial" | "none";

/**
 * Every suggested slot is checked equally. Perfect: free at a slot all remaining players
 * voted for, or a 2-hour overlap with all of them. Partial: free at any slot, or 2h with 2+.
 */
export function candidateFit(candidate: string[], remaining: string[][], tallies: SlotTally[]): { fit: Fit; slots: string[] } {
  const mine = toBlocks(candidate);
  if (mine.size === 0) return { fit: "none", slots: [] };
  const free = (epoch: number) => [0, 1, 2, 3].every((k) => mine.has(Math.floor(epoch / HALF) + k));
  const slotHits = tallies.filter((t) => t.epoch != null && free(t.epoch));
  const others = remaining.map(toBlocks);
  const overlap = (need: number) =>
    [...mine].some((b) => others.filter((o) => [0, 1, 2, 3].every((k) => mine.has(b + k) && o.has(b + k))).length >= need);
  const slots = slotHits.map((t) => t.label);
  if (slotHits.some((t) => t.of > 0 && t.yes === t.of) || (others.length > 0 && overlap(others.length))) return { fit: "perfect", slots };
  if (slotHits.length > 0 || (others.length >= 2 && overlap(2))) return { fit: "partial", slots };
  return { fit: "none", slots };
}

/** New schedule fields after a swap: the replaced player's votes are wiped, the newcomer has none. */
export function applyReplacement(s: SubSchedule, oldIndex: number, newId: string, newName: string) {
  const ids = [...(s.player_discord_ids ?? [])].map((x) => (x == null ? "" : String(x)));
  const names = [...(s.player_names ?? [])];
  const oldId = ids[oldIndex];
  const votes = { ...voteMap(s.votes) };
  if (oldId) delete votes[oldId];
  delete votes[newId];
  ids[oldIndex] = newId;
  names[oldIndex] = newName;
  return { player_discord_ids: ids, player_names: names, votes, votes_count: Object.keys(votes).length, status: "pending_votes" };
}
