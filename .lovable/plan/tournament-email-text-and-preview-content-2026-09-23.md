# Tournament email text and preview content

## Changes
- Change tournament emails to always send as **Strategy Arena <notifications@dunestats.cc>**.
- Extend the saved tournament email template with two editable fields:
  - **Preview text** for the short inbox snippet shown beside the subject.
  - **Plain text** as the readable fallback for email clients that do not display HTML.
- Add both fields to the tournament email admin page, load/save them with the default template, render placeholders in previews, and include them when sending test or audience emails.
- Keep existing saved subject and HTML templates compatible by supplying sensible built-in defaults when the new fields are empty.

## Technical details
- Add nullable `preview_text_template` and `text_template` columns to `email_templates` in a Supabase migration.
- Inject rendered preview text into outgoing HTML as a hidden preheader while also sending Resend's `text` field.
- Preserve the existing personalized unsubscribe link in both HTML and plain-text output.
- Verify the app build after implementation.
