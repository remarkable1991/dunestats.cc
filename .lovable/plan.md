## Goal

Add a second "Overall (Lifetime)" ELO track that aggregates every match across all expansions, keep the existing per-version tracks, lift hard query limits, and paginate Matches so the full 2,000+ game dataset is browsable smoothly.

## 1. Database

New migration:
- Extend `game_version` enum with value `overall`.
- Recompute / backfill: for every existing game (ordered by `created_at`), insert a duplicate `game_results` row set under a parallel "overall" track. Rather than duplicating result rows (which would skew leader stats), keep `game_results` untouched and instead maintain the Overall track purely inside `player_ratings` + a new `game_results_overall_delta` numeric column on `game_results` to allow reverts.
- Add columns on `game_results`: `elo_delta_overall numeric not null default 0`.
- Seed `player_ratings` rows with `game_version = 'overall'` by replaying every historical match in chronological order through the existing pairwise ELO formula (K=32 / (N-1), start 1000). Done as a one-shot SQL/PLpgSQL block inside the migration.

Stats pages keep reading `game_results` directly (so leader pickrate/winrate are unaffected by the new track).

## 2. Server functions (`src/lib/games.functions.ts`)

- `saveGame`: after updating the per-version `player_ratings`, run a second ELO pass for the same players in `game_version='overall'` and persist `elo_delta_overall` per result row.
- `deleteGame`: revert both the version-specific delta and the overall delta, decrement `games_played/wins/top2/total_points` on both rows.
- `claimPlayer`: when claiming, also flag the `overall` row for that key; reset (one-time) wipes both rows.

## 3. Leaderboard UI (`src/routes/leaderboard.tsx`)

- Replace the 3-tab strip with 4 tabs: `Overall`, `Base Game`, `Rise of Ix`, `Uprising`. Overall is the default landing tab and visually highlighted.
- Remove `.limit(500)`; fetch with keyset pagination (page size 50) using `range()` on `elo desc, player_key`.
- Add a page selector (Prev / page X of Y / Next) under the table.
- "Min games" filter and search keep working on the active page (server-side: pass min_games into the query via `.gte('games_played', n)`; search uses `ilike` on `display_name`).

## 4. Matches page (`src/routes/matches.tsx`)

- Remove the hard-coded `.limit(300)`.
- Convert to server-side pagination: 20 matches per page, ordered by `created_at desc`. URL search params `?page=&version=&q=&mine=` via `validateSearch` so links are shareable.
- Version filter dropdown gets a clear label ("Game version") and includes `All / Base / Rise of Ix / Uprising`. Same dropdown is reused on Stats and Player profile filters.
- Use TanStack Query `useQuery` with `keepPreviousData` for snappy page transitions; supabase `count: 'exact', head: false` to drive the pager.
- Optional: virtualize the per-page list with `@tanstack/react-virtual` only if cards exceed viewport — pagination is the primary mechanism.

## 5. Stats page (`src/routes/stats.tsx`)

- Remove the `.limit(20000)` cap. Page through `game_results` in 1000-row chunks server-side (loop with `.range()` until exhausted), aggregating in memory; cache result in TanStack Query with 5-minute staleTime so users don't refetch on every tab switch.
- Add an "Overall" tab that aggregates across all `game_version` values; keep per-version tabs.
- Add a version dropdown mirror for parity with Matches.

## 6. Player profile (`src/routes/players.$key.tsx`)

- Show four ELO cards (Overall + 3 versions) reading from `player_ratings` for that `player_key`.
- Recent matches list: paginated (20/page) same pattern as Matches.

## 7. Home page top-player preview

- Switch the "top players" preview to read `game_version='overall'` and label it "Top lifetime players".

## Technical notes

- `player_ratings` already has unique `(player_key, game_version)`; the new enum value slots in without schema breakage.
- `count: 'exact'` on Supabase has a small overhead but is fine at ~2k rows; we'll cache the count per filter combo for 30s.
- ELO replay in the migration uses a PLpgSQL function reading `games` + `game_results` in `created_at` order; it is idempotent (deletes & rebuilds the `overall` rows in `player_ratings`).
- No changes to leader stats grouping — that page still derives from raw `game_results`.

## Out of scope

- Re-importing the two new CSV exports you mentioned — they were not attached to this turn. The existing seeded 2,082-game dataset is what gets replayed. If you upload them, a follow-up migration can replace the current seed before the Overall replay runs.
