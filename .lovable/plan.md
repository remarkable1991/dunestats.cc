# Strategy Points (SP) — Phased Rollout

Scope is large. Splitting to keep risk low and each phase shippable.

## Phase 1 (this PR) — Data model + legacy backfill + read-only /ledger
- New tables (keyed by `player_key`, so unregistered names accumulate too):
  - `public.player_sp` — `player_key`, `lifetime_sp`, `seasonal_sp`, `season_id`, `is_claimed`, `claimed_by`, timestamps.
  - `public.sp_events` — audit log: `player_key`, `user_id` (nullable), `action_type`, `amount`, `is_legacy`, `season_id`, `ref_game_id`, `ref_tournament_id`, `created_at`.
  - `public.sp_seasons` — season windows (Season 1 starts 2026-07-01, 3-month cadence).
- Backfill function: replay all `game_results` and `tournament_matches`.
  - `created_at < 2026-07-01` → 10% multiplier, **lifetime only**, `is_legacy=true`, `seasonal_sp=0`.
  - `>= 2026-07-01` → 100%, both tracks.
  - Match SP: **+20 to every player in `game_results`** (uploader + participants parity, per user answer).
  - Tournament SP: infer completion / round wins / semi / final / champion from `tournament_matches` phase data.
- Claim hook: when `claim_player_name` runs, mark `player_sp.is_claimed=true` and set `claimed_by`.
- New route `/ledger`:
  - Tabs: Seasonal / Lifetime.
  - "Unclaimed Accounts" toggle.
  - "🏆 Seasonal Prizes: TBA Soon!" badge on seasonal tab.
  - "Learn More" modal (Elo vs SP, point values, uploader/verifier parity note).

## Phase 2 — Live earning loops
- Daily check-in (+5 SP, toast).
- Match upload → live +20 SP for each claimed participant (skip legacy multiplier).
- Tournament finalize → live milestone SP.

## Phase 3 — Referral funnel
- `/r/:username` route, cookie/attribution capture.
- Phase 1 (+100 referrer / +50 new user on signup).
- Phase 2 (+500 referrer when referee lifetime_sp crosses 100).

## Phase 4 — Profile UI
- Title badge (Spiceworker → Kwisatz Haderach).
- Two animated progress bars (title tier, seasonal 1000 SP).
- SP history audit table.

Starting Phase 1 now.
