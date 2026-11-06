# To do

- [x] Add a shared upload identity check that stays silent when any claimed IGN matches the screenshot.
- [x] Add the seat-confirmation dialog with taken-seat protection, optional claiming, and OCR alias correction.
- [x] Use the flow on /upload, /tournament, and /lfg result uploads.
- [x] Add rule tests and smoke-test the public upload screens; signed-in end-to-end testing is unavailable with external unmanaged auth.
- [x] Repair Lobby 538 / MEEKER-PLASTEEL-7914 so Ámenhotep's result, ratings, SP and alias belong to Amenhotep.
- [x] Normalize accents before lobby-seat matching and add regression tests.
- [x] Prioritize the seated lobby roster during screenshot-name normalization.
- [x] Paginate master-player and alias reads beyond Supabase's 1,000-row response cap.
- [x] Run targeted tests, verify the repaired records and match page, and check the build.
