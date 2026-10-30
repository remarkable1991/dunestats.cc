# Roadmap

- [x] Preview only the oldest available League game and switch Join queue to Join game without changing database behavior.
- [x] Pass nine queue selection/identity tests and confirm the preview build is clean.
- [ ] Verify populated queue joining end-to-end; external unmanaged Supabase provides no authenticated test session, and the isolated browser fixture did not supply live game data.

- [x] Detect existing linked Discord roles and atomically save the user's Discord opening-alert preference to their mapping.
- [x] Pass eleven alert-rule tests, verify service-only access and ReMarkable's existing role, and document external bot role reconciliation.
- [ ] Verify signed-in Discord toggle end-to-end; external unmanaged Supabase provides no test session.
- [x] Add LFG alert preferences, atomic browser acknowledgements and timed, suppressed email fallback.
- [x] Restrict League early starts and share three-player voting on list/detail; display Discord chat requests.
- [x] Test delivery/start rules and verify public LFG page; document external delivery verification blockers.
- [ ] Connect minute-by-minute email scheduler and publish its endpoint; external scheduler access is unavailable.
- [ ] Apply requested mapping role changes in Discord and connect verified three-player vote actors; bot source/runtime is unavailable.
- [ ] Verify signed-in browser receipts and real email/vote flows; external unmanaged Supabase supplies no test session.

- [x] Relax qualifier backup conflicts in Levels 1–2 and cross-game checks from Level 3; preserve Discord exports and standby handling.
- [x] Pass eleven qualifier/semi-finals tests and verify a 32-player browser search completes at Level 3 without runtime errors.
- [ ] Verify real signed-in Matchmaker Studio review; blocked by external unmanaged Supabase session access.

- [x] Add read-only Discord verification, recorded-game profile links and registration timezones in Manage Registrations.
- [x] Pass thirteen identity/verification tests and verify the sample registration panel and profile link with no browser errors.
- [ ] Verify registration checks with real signed-in staff data; external unmanaged Supabase provides no test session.

- [x] Add self-only Leave Seat on both lobby views, with atomic roster changes and host/started-lobby safeguards.
- [x] Pass eighteen leave/identity/history tests, confirm service-only permissions, and verify public lobby views with a clean build.
- [ ] Verify signed-in self-leave end-to-end; external unmanaged Supabase provides no test session.

- [x] Add paginated played-lobby history and admin history access from LFG.
- [x] Add admin Discord mapping, match linking and atomic SP/global/recorded-League Elo reversal.
- [x] Fix Content Creator assignment and show queue Elo/profile links.
- [x] Pass sixteen tests and transactional database rollback checks; verify real public history on desktop/mobile.
- [ ] Verify signed-in admin history, mapping/link dialogs, queue ratings and role assignment end-to-end; external unmanaged Supabase provides no test session.
- [ ] Deploy bot use of apply_league_match_ratings for reversible future League contributions; bot source/runtime is not available here. Historic contributions without recorded deltas are blocked safely.

- [x] Resolve Discord lobby names through the guild directory without silently verifying suggestions.
- [x] Link BLUDGEON to his claimed name and add safe duplicate-account player-data consolidation without merging sign-in accounts.
- [x] Make lobby titles clickable, lock League format settings, remove duplicate footers and make the League queue Live-only.
- [x] Run eleven identity/scheduling tests and verify single-footers on public list/detail pages; build is clean.
- [ ] Verify populated signed-in lobby controls and account transfer; blocked by external unmanaged Supabase session access.
- [ ] Verify Discord ghost pings; blocked by bot deployment/runtime access. Website keeps the existing queue and lobby event paths.

- [x] Add semi-finals roster inclusion, trial registration linking, timezones and last-update visibility.
- [x] Add configurable window lengths and no-zero availability ranking with window counts.
- [x] Verify six scheduling tests and browser-fixture review flow without changing qualifier methods or database.
- [ ] Verify authenticated real-data review; blocked by external unmanaged Supabase session access.

- [x] Show lobby icons and the host's game name on lobby details.
- [x] Add host/admin cancellation on the LFG list and lobby details without schema changes.
- [x] Verify lobby display and cancellation controls with browser fixtures; real authenticated cancellation remains untested on external Supabase.

- [x] Show linked League fixed-format selections in survey results.
- [x] Restore saved responses for returning signed-in players.
- [x] Improve survey result summaries and visual comparisons.
- [x] Verify type safety, public survey rendering, and build health.
- [x] Enable guided match verification on phone, tablet, and computer.
- [x] Align each guided faction step with its exact faction editor.
- [x] Add a clear start-verification action at the top of match pages.

- [x] In-place League screenshot upload on lobby page with green/yellow/orange player checks and admin review queue.
- [ ] Verify signed-in real upload end to end; blocked by external Supabase session access.

- [x] League unlink options (delete / back to League / casual + promote) with League Elo revert.
- [x] Lobby result upload open to anyone with the link (signed in).
- [x] Auto-save Discord↔IGN mapping for confirmed seats on report; MechanicsBeatsTheme mapped.
- [x] League Elo by default on match page and /matches with profile-saved "Show all stats".
- [x] Public League leaderboard as the default tab.
- [ ] Match-page endboard upload for non-participants: left participant/staff-only to protect match edits; awaiting user decision.
- [ ] Verify signed-in admin unlink flows; external unmanaged Supabase provides no test session.
