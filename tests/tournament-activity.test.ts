import { describe, expect, it } from "vitest";
import { tournamentActivity, type TableResult, type TournamentReview } from "../src/lib/tournament-activity";
import type { MatchSchedule } from "../src/lib/match-schedules";

const now = Date.parse("2026-11-27T18:05:00Z");
const identity = { playerKeys: ["mark"], discordIds: ["123"] };
const schedule: MatchSchedule = {
  id: "s1", tournament_num: 21, round_type: "Game 2", table_identifier: "Table 5", match_code: null,
  mode: "live", status: "pending_votes", votes_count: 0, confirmed_slot: null, confirmed_time_text: null,
  confirmed_timestamp: null, player_names: ["Mark", "Alice", "Bob", "Carol"], player_discord_ids: ["123", "456", "789", "012"], votes: {},
};
const classify = (s: MatchSchedule, results: TableResult[] = [], reviews: TournamentReview[] = []) => tournamentActivity([s], results, reviews, identity, now);

describe("personal tournament activity", () => {
  it("includes pending votes for a seated player who has not voted", () => {
    expect(classify(schedule).map((r) => r.kind)).toEqual(["vote_needed"]);
  });
  it("keeps pending tables after the player's vote while waiting for teammates", () => {
    expect(classify({ ...schedule, votes: { "123": ["A"] }, votes_count: 1 }).map((r) => r.kind)).toEqual(["waiting_votes"]);
  });
  it("includes async games marked as started without results", () => {
    expect(classify({ ...schedule, mode: "async", status: "ongoing" }).map((r) => r.kind)).toEqual(["awaiting_result"]);
  });
  it("includes explicitly ongoing live games", () => {
    expect(classify({ ...schedule, status: "ongoing" }).map((r) => r.kind)).toEqual(["awaiting_result"]);
  });
  it("includes live confirmed games only once their scheduled time arrives", () => {
    expect(classify({ ...schedule, status: "confirmed", confirmed_timestamp: "2026-11-27T18:05:00Z" }).map((r) => r.kind)).toEqual(["awaiting_result"]);
    expect(classify({ ...schedule, status: "confirmed", confirmed_timestamp: "2026-11-27T18:06:00Z" })).toEqual([]);
    expect(classify({ ...schedule, status: "confirmed" })).toEqual([]);
  });
  it("excludes completed tables even if scheduling status remains ongoing", () => {
    const results = ["Mark", "Alice", "Bob", "Carol"].map((player_name, i) => ({ tournament_num: 21, round_type: "Game 2", table_identifier: "Table 5", player_name, placement: i + 1, points: 10 - i }));
    expect(classify({ ...schedule, status: "ongoing" }, results)).toEqual([]);
    expect(classify({ ...schedule, status: "ongoing" }, results.slice(0, 3))).toHaveLength(1);
  });
  it("replaces an awaiting-result entry with its own pending review", () => {
    const review: TournamentReview = { id: "r1", tournament_num: 21, round_type: "Game 2", table_identifier: "Table 5", created_at: "2026-11-27T18:00:00Z", unmatched: [], game_id: "g1" };
    expect(classify({ ...schedule, status: "ongoing" }, [], [review, { ...review, id: "r2" }]).map((r) => r.kind)).toEqual(["under_review"]);
  });
  it("excludes other players' tables but accepts a claimed Discord ID", () => {
    expect(classify({ ...schedule, player_names: ["Other"], player_discord_ids: ["999"] })).toEqual([]);
    expect(classify({ ...schedule, player_names: ["Different spelling"], player_discord_ids: ["123"] })).toHaveLength(1);
  });
  it("does not treat published or cancelled games as started", () => {
    expect(classify({ ...schedule, mode: "async", status: "published" })).toEqual([]);
    expect(classify({ ...schedule, status: "cancelled" })).toEqual([]);
  });
});