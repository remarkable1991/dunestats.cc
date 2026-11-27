import { parseScheduleTime, voterStates, type MatchSchedule } from "./match-schedules";

export type TournamentReview = {
  id: string;
  tournament_num: number;
  round_type: string | null;
  table_identifier: string | null;
  created_at: string;
  unmatched: unknown;
  game_id: string | null;
};
export type ActivityIdentity = { playerKeys: string[]; discordIds: string[] };
export type TableResult = {
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  placement: number | null;
  points: number | null;
};
export type TournamentActivity = {
  id: string;
  tournament_num: number;
  round_type: string | null;
  table_identifier: string | null;
  kind: "vote_needed" | "waiting_votes" | "awaiting_result" | "under_review";
  schedule: MatchSchedule | null;
  review: TournamentReview | null;
};
const key = (value: string) => value.trim().toLowerCase();
const tableKey = (r: { tournament_num: number; round_type: string | null; table_identifier: string | null }) =>
  JSON.stringify([r.tournament_num, r.round_type, r.table_identifier]);

export function isActivityParticipant(schedule: MatchSchedule, identity: ActivityIdentity) {
  return (schedule.player_names ?? []).some((name) => identity.playerKeys.includes(key(name))) ||
    (schedule.player_discord_ids ?? []).some((id) => identity.discordIds.includes(id));
}

export function tournamentActivity(
  schedules: MatchSchedule[], results: TableResult[], reviews: TournamentReview[], identity: ActivityIdentity, now: number,
): TournamentActivity[] {
  const reviewTables = new Set(reviews.filter((r) => r.round_type && r.table_identifier).map(tableKey));
  const completed = new Map<string, Set<string>>();
  for (const result of results) {
    if (result.placement == null || result.placement < 1 || result.points == null) continue;
    const id = tableKey(result);
    const players = completed.get(id) ?? new Set<string>();
    players.add(key(result.player_name));
    completed.set(id, players);
  }
  const activity: TournamentActivity[] = [];
  const seen = new Set<string>();
  for (const schedule of schedules) {
    const id = tableKey(schedule);
    if (!isActivityParticipant(schedule, identity) || reviewTables.has(id) || (completed.get(id)?.size ?? 0) >= 4 || seen.has(id)) continue;
    const status = (schedule.status ?? "").toLowerCase();
    let kind: TournamentActivity["kind"];
    if (status === "pending_votes") {
      const ownVotes = voterStates(schedule).filter((v) => identity.playerKeys.includes(key(v.player_name)) ||
        (v.discord_id != null && identity.discordIds.includes(v.discord_id)));
      kind = ownVotes.length > 0 && ownVotes.every((v) => v.voted) ? "waiting_votes" : "vote_needed";
    } else {
      const when = parseScheduleTime(schedule);
      if (status !== "ongoing" && !(status === "confirmed" && schedule.mode?.toLowerCase() === "live" && when && when.getTime() <= now)) continue;
      kind = "awaiting_result";
    }
    seen.add(id);
    activity.push({ id: schedule.id, tournament_num: schedule.tournament_num, round_type: schedule.round_type,
      table_identifier: schedule.table_identifier, kind, schedule, review: null });
  }
  for (const review of reviews) {
    const id = tableKey(review);
    if (review.round_type && review.table_identifier && seen.has(id)) continue;
    if (review.round_type && review.table_identifier) seen.add(id);
    activity.push({ id: review.id, tournament_num: review.tournament_num, round_type: review.round_type,
      table_identifier: review.table_identifier, kind: "under_review", schedule: null, review });
  }
  const priority = { vote_needed: 0, awaiting_result: 1, waiting_votes: 2, under_review: 3 };
  return activity.sort((a, b) => priority[a.kind] - priority[b.kind] || b.tournament_num - a.tournament_num);
}