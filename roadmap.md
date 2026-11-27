# Match-linking and uploader fixes

- [x] Clear lobby links and restore waiting-for-result state when a match is deleted; clean existing stale links.
- [x] Resolve uploaders through claimed ratings, Discord mappings, then account profiles.
- [x] Require an explicit League lobby confirmation or “None of these” before submitting ambiguous uploads.
- [x] Run focused tests, typecheck/build checks, and browser verification.

# Tournament activity

- [x] Include seated players' pending votes and started games without results alongside their reviews.
- [x] Share the activity count across the panel and navigation, with table links and clear statuses.
- [x] Pass nine classification tests and verify desktop/mobile signed-out views and a real ongoing table link.
- [ ] Verify the personal panel while signed in — blocked because this user-managed Supabase project cannot supply a browser test session.
