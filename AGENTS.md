<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Lobby League Elo reads are batched by seated player keys and lobby season under pilot RLS; this keeps seasonal ratings separate and inaccessible to non-pilot users.
- Semi-finals scheduling stays isolated from qualifier methods; registration overrides are trial-only and candidate ranking uses shared player-block coverage with nonzero per-player availability to avoid impossible timezone fallbacks.
- Semi-finals select newest exact duplicate registrations, persist trial overrides per tournament in browser storage, and derive seven-day reminders from the selected semi-final pool; guest/account reconciliation requires the authenticated account's exact claimed IGN to avoid identity takeover.
- Qualifier cross-game policy is explicit per strategy and the fixed-draft evaluator shares the search evaluator; this keeps fallback behavior testable without changing CSV serialization or semi-finals.
- LFG roster merging and lobby membership/host checks live in `src/lib/lfg-seats.ts`, shared by `/lfg` and `/lfg/$id`; one source of truth avoids the list and detail pages disagreeing on who is seated.
- Lobby format artwork and cancellation controls are shared between list and detail pages; cancellation verifies authenticated host ownership or LFG/admin roles server-side before changing the existing status, preserving roster and history without schema changes.
- Lobby identity display uses a shared verified-map-first guild-directory resolver; directory suggestions may label/link players but must never grant host/member access or silently write authoritative mappings.
- Main-admin player-record consolidation runs atomically through a service-only RPC after server-side role verification; it never moves Auth identities or grants permissions, and conflicting tournament registrations require separate review.
- League settings writes preserve format fields in the database RPC; unedited guest lists use NULL to preserve the latest roster rather than replacing it from stale forms.
- LFG history queries filter and paginate before display; successful public history excludes private League rows, and privileged history reads verify roles server-side before service access.
- Match/lobby corrections run service-only atomic RPCs with an authenticated administrator actor; missing per-match League deltas block rollback instead of guessing rating contributions.
- Bot League ratings must use service-only `apply_league_match_ratings(game_id, season, results)` with player_key, elo_delta and won contributions, never apply direct aggregate updates as well; the ledger makes duplicate application detectable and reversal exact.
- Upload links and admin re-links share `applyLinkedLeagueElo` in a server-only helper; use the lobby's recorded season, validate complete existing deltas, and surface admin completion failures so a repeated link can safely retry missing ratings.
- Lobby self-leave uses an authenticated server function and a service-only row-locked RPC deriving seat ownership from the authenticated actor's UUID and claimed Discord mapping; this preserves other players, guests and aligned roster arrays without authorizing by display-name similarity.
- Admin IGN corrections run through main-admin server functions in `src/lib/player-admin.functions.ts` (/admin/players) and always record a `player_name_aliases` row; one place keeps seats, registrations, account claims and future registration hints in sync.
- Registration verification is read-only and paginates directory, authoritative mappings and overall ratings; guild presence never verifies an IGN, and unavailable reads must not be displayed as negative matches.
- LFG alert delivery uses an atomic per-event browser/email claim; uncertain browser delivery stays email-blocked, and the dedicated alert dispatcher shares the outbox budget without passing LFG alerts through the generic dispatcher.
- Discord opening-alert changes use an authenticated server wrapper and service-only atomic ownership-scoped RPC; mapping preferences are desired state, guild role flags are observed state, and unrelated settings never overwrite Discord preferences.
- League early-start controls share a database-enforced, roster-bound unanimous vote; Discord integrations must submit authenticated seat identities rather than trusting public chat sender names.
- League queue game previews use the existing queue RPC's raw seat capacity and oldest-first eligibility through a browser-safe helper; joining remains authoritative in the existing RPC.
- Admin-only tournament player substitution runs through main-admin server functions in `src/lib/tournament-substitute.functions.ts`; it removes only the replaced player's votes and never overwrites an existing Discord mapping.
- Lobby player substitution runs through the service-only `lfg_admin_substitute_player` RPC; it never rewrites `player_ids` or Discord mappings, only name arrays (aligning `expected_player_keys` to the existing `player_ids` order for Discord seats), and SP transfers append compensating `sp_events` rows instead of editing originals.
- Lobby-page result uploads scan and submit in place via `src/components/LobbyResultUpload.tsx`; per-player confidence comes from pure `src/lib/lobby-result-match.ts`, and any non-green match still submits but writes an `lfg_result_reviews` row for admins, so uncertain identities never block reporting.
- All screenshot result uploads share `useUploaderIdentity`; any claimed IGN on the endboard suppresses the prompt, while unmatched uploaders explicitly choose a seat, claim an unclaimed IGN, or map a confusable OCR spelling to their own claimed IGN after the match is saved.
- League leaderboard totals and view ranks use the pure `league-leaderboard` helper; seasonal ledger gains/loss magnitudes and post-filter sorting remain independently testable.
