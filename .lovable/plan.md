# Email notifications people can subscribe to

Yes — we can send automated emails for key events, but only to people who opt in.

## What players can subscribe to

On their profile page a new "Email notifications" section with toggles, all **off by default**:

- Tournament news — a new tournament opens, registration closes, check-in phase starts
- Match results — a match you played in is saved, with your placement and rating change
- Rewards — Strategy Points earned and referral payouts
- Admin only (admins see this extra one) — a match is waiting for approval

Each email has an unsubscribe link at the bottom that turns that category off without logging in.

## How it works

- Preferences are stored per account, so they follow the player across devices.
- Emails go to the address on their account.
- Sending happens automatically when the event occurs: a match being saved, a tournament being published or opening check-in, points being awarded.
- To avoid inbox spam, match and reward emails are limited to a sensible cap per day per person.

## What you need to decide / provide

- A sender address on a domain you own (for example `notifications@dunestats.nl`). Verification of that domain has to be done before any mail goes out; I can start that step.
- If you'd rather not set up a domain yet, we can build everything and keep sending switched off until the domain is ready.

## Technical notes

- New table `email_preferences` (user_id, per-category booleans, unsubscribe token), RLS: owner reads/writes own row; grants for `authenticated`, `service_role`.
- Row created by the existing `handle_new_user()` trigger path (extend it) with all categories false.
- Sending via a server function `src/lib/email-notify.functions.ts` using the already-linked Resend connector (same gateway pattern as `src/lib/feedback.functions.ts`), reading recipient + preference server-side; never trust a client-supplied recipient.
- Triggers:
  - Match results: DB trigger on `game_results` insert writes to a small `email_outbox` table; a public cron route `src/routes/api/public/email-dispatch.ts` (shared-secret header) drains it in batches.
  - Tournament + rewards events: same outbox, written by `sp_events` insert trigger and by the admin tournament publish/check-in actions.
  - Outbox gives retries and prevents duplicate sends (unique key per user+event).
- Unsubscribe: public route `src/routes/api/public/email-unsubscribe.ts` validating the token, flipping the category off.
- Templates rendered as simple inline-styled HTML in one module, brand colors from the design tokens.

## Build order

1. Migration: `email_preferences`, `email_outbox`, triggers, grants, RLS.
2. Profile UI toggles.
3. Server send function + templates.
4. Cron dispatch route + unsubscribe route.
5. Domain/sender verification, then enable sending.
