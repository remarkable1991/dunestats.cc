# To do

- [x] Replace the home stats with the approved eight-metric grid using complete tournament, League, game and lobby sources.
- [x] Test the counting rules and verify the live totals and two-column mobile/four-column desktop layouts.

- [x] Make League leaderboard ranks follow filtering/sorting and add sortable seasonal ELO gained/lost totals.
- [x] Test totals and ranking rules, and verify the live leaderboard filters and sorts on desktop/mobile with real League rows.

- [x] Rank open League lobby candidates by seated-player matches, then newest first; require confirmation for ambiguous or incomplete matches.
- [x] Add the safest-upload guidance to /upload and keep unambiguous 4/4 links automatic.
- [x] Enforce one linked lobby per game in the database and repair duplicate links plus BASIN-FILTRATION-4698 League ratings.
- [x] Add regression tests, run all tests and typecheck, and verify the repaired public match; signed-in upload interaction remains untested with external unmanaged auth.

- [x] Add manual score entry to lobby result reporting with seated players, rearrangeable ranks, leader dropdowns and VP inputs.
- [x] Allow verified admins to deliberately re-link an existing Discord mapping instead of blocking on the old IGN.
- [x] Repair Lobby 728 / KWISATZ-ORITHOPTER-5790 for Spellcastermax and Gabriel, including ratings, aliases, lobby link and League Elo.
- [x] Run all 103 tests, verify the admin re-link transaction and repaired public match page; signed-in manual submission could not be browser-tested with external unmanaged auth.

- [x] Replace the single 16-player snake split with table-first search and adjustable average-rank bounds.
- [x] Prefer the requested suggestions per table, show viable-table/split counts, and explain when no complete split fits.
- [x] Add non-pot, rank-bound and two-suggestion regression tests; run all 97 tests, typecheck and check the preview build.

- [x] Fix tournament registration link aliases and newest duplicate matching.
- [x] Safely reconcile Tournament 20 duplicate registrations and prevent repeat guest/account duplicates.
- [x] Persist semi-finals trial registration overrides and add a seven-day Discord update reminder.
- [x] Run 19 regression tests and verify Tournament 20 links on desktop/mobile; authenticated registration and admin semi-finals UI checks are unavailable with external unmanaged auth.

- [x] Restore BASIN-SIETCH-5272 to League in Lobby 593 with its four seasonal rating contributions.
- [x] Make admin League re-linking restore League status and apply missing ratings without duplicates.
- [x] Run linking regression tests and verify repaired profile history on all four profiles; authenticated admin UI testing is unavailable with external unmanaged auth.

- [x] Add a shared upload identity check that stays silent when any claimed IGN matches the screenshot.
- [x] Add the seat-confirmation dialog with taken-seat protection, optional claiming, and OCR alias correction.
- [x] Use the flow on /upload, /tournament, and /lfg result uploads.
- [x] Add rule tests and smoke-test the public upload screens; signed-in end-to-end testing is unavailable with external unmanaged auth.
- [x] Repair Lobby 538 / MEEKER-PLASTEEL-7914 so Ámenhotep's result, ratings, SP and alias belong to Amenhotep.
- [x] Normalize accents before lobby-seat matching and add regression tests.
- [x] Prioritize the seated lobby roster during screenshot-name normalization.
- [x] Paginate master-player and alias reads beyond Supabase's 1,000-row response cap.
- [x] Run targeted tests, verify the repaired records and match page, and check the build.

- [x] Show the linked LFG lobby on League match pages.
- [x] Add paginated player-name search and quick player filters to played LFG history.
- [x] Show both match ID and LFG lobby links in League profile history.
- [x] Run targeted checks and verify all three flows in the preview.
