# To do

- [ ] Fix tournament registration link aliases and newest duplicate matching.
- [ ] Safely reconcile Tournament 20 duplicate registrations and prevent repeat guest/account duplicates.
- [ ] Persist semi-finals trial registration overrides and add a seven-day Discord update reminder.
- [ ] Run regression tests and verify the registration and semi-finals flows available in the preview.

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
