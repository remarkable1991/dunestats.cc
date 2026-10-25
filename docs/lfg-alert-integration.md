# LFG alert integration

## Email scheduler

Call `POST https://dunestats.cc/api/public/lfg-alerts/dispatch` once per minute with the existing `EMAIL_CRON_SECRET` value in the `x-cron-secret` header. Do not put the secret in the URL, database or source code. This endpoint must be published before an external scheduler can call it. No scheduler was configured in this task; this external Supabase project has neither pg_cron nor pg_net installed.

Alerts wait three minutes before becoming eligible for email, expire after thirty minutes, and require a currently active 1/2/4-hour email window. Only one email per recipient per thirty minutes is allowed. Combined LFG and ordinary email reservations use the same 80-per-rolling-day budget. Browser claims are atomic against email claims; an uncertain browser outcome stays blocked indefinitely for that event, deliberately preferring a missed backup over a duplicate email. Explicit browser failure before display releases the claim.

## Discord preferences

`lfg_alert_preferences.discord_openings` stores the user's requested Discord opening-alert preference; it does not grant or remove any Discord role. The bot must reconcile this field using verified `player_discord_map.claimed_by`/`discord_user_id` ownership. Existing `has_league_lfg_role` fields must not grant website League pilot access. No bot code or runtime was available to implement this reconciliation.

## Three-player League votes

Website starts use `lfg_vote_three(lobby_id, agree)` with the user's authenticated session. The requester's vote counts as one agreement. All three verified seated identities must agree; roster changes discard the vote. Direct League starts below four seats are rejected without a complete roster-bound vote, including service/bot writes.

The bot must integrate the vote state before offering three-player starts. Legacy `start_3p_ask` and `agree_3p` chat entries are displayed and notified on the website, but cannot authorize starts: the publicly writable sender-name field is not a verified actor identity. Bot integration needs a verified Discord-actor path; do not infer approval from chat sender names.

## Verification

Public LFG panel was checked at desktop and mobile sizes without overflow or browser errors. Delivery/start rules have automated tests. Real signed-in browser receipts, email delivery and Discord events remain unverified because external unmanaged Supabase provides no test session, and the scheduler/bot are external.