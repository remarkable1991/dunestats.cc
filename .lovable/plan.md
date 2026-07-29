## Goal

One code path handles every match upload. Whether the user submits from `/upload` or from a table on `/tournament`, we always:

1. Save the game globally (ELO + duplicate check + sandbox sync).
2. If the match belongs to a tournament table, also update that specific `tournament_matches` slot and upsert the `tournament_table_screenshots` row.

The Tournament / Round / Table selector no longer shows by default. It appears only when:
- the screenshot's detected players match a known tournament table, **or**
- the user opened the panel from a table's "Submit Table Results" button (or via a deep link).

In both cases the user gets an "This is not a tournament game" opt‑out that hides the tournament fields and skips the tournament writes.

## What we build

### 1. New `src/lib/match-submit.ts`

Single async `submitMatch(params)` that both routes call. It receives:

- `userId`, `file` (nullable), `board`, `hasIx`, `hasEpic`, `hasImmortality`, `hasBaseLeaders`
- `rows` (placement/player/leader/points)
- `tournament: { num, round, table } | null` — when non‑null the tournament writes run

Steps (in order):
1. Upload screenshot to `match-screenshots` bucket, get storage path.
2. Duplicate check against the last 25 uploaded games using the existing fingerprint (`sorted "player|points"` list). If duplicate and no `confirmDuplicate` flag, return `{ duplicate: true }` so the caller can prompt.
3. Call `saveGame` with `tournament_num` (or `null`) and the screenshot path.
4. Fire-and-forget `sync_new_game_to_sandbox_by_id` (same as `/upload` today).
5. If `tournament` is provided: upsert `tournament_table_screenshots` and update each matching `tournament_matches` row (placement/points/leader) exactly as `/tournament` does today.
6. Return `{ saveResult, publicMatchId, tournamentApplied }`.

### 2. `/upload` (`src/routes/upload.tsx`)

- After `parseScreenshot`, run `detectTournamentFromPlayers` (already there) **and** look up the matching `(round_type, table_identifier)` in `tournament_matches` for that tournament (same fuzzy match already used in `/tournament`'s `onFile`).
- If a table is found, show a small "Detected: Tournament #X · Round · Table" strip with an editable Round/Table select and a **"Not a tournament game"** checkbox. Otherwise the tournament UI stays hidden.
- `save()` becomes a thin wrapper around `submitMatch(...)` passing `tournament` when the detected block is visible and not opted out.

### 3. `/tournament` (`src/routes/tournament.tsx`, `CurrentTournament`)

- Delete the local `submitResults` function and call `submitMatch(...)` with the currently selected `round` / `tableId` as the tournament context.
- The inline "Submit Table Results" panel keeps the Round/Table dropdowns visible (the user is already inside a tournament view). Behavior is unchanged for the user.

### 4. Detection UX (both routes)

Rule for showing the Tournament / Round / Table row:

```text
show tournament block IF (
  screenshot detected a tournament + table
  OR the user opened the panel via "Submit Table Results" for a specific table
  OR a deep link opened /tournament?t=…&round=…&table=…
)
AND user has NOT ticked "Not a tournament game"
```

When hidden, the submit button reads "Submit match" (global only). When visible, it reads "Submit to Round · Table" and does both writes in one call.

## Files touched

- **New**: `src/lib/match-submit.ts` — the unified pipeline.
- **Edit**: `src/routes/upload.tsx` — replace `save()`; add tournament‑table auto‑detect + opt‑out UI.
- **Edit**: `src/routes/tournament.tsx` — replace `submitResults` with `submitMatch` call; keep existing panel visuals.

Nothing changes in the DB schema, RPCs, or public routes.
