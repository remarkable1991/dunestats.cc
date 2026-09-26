# Responsive top navigation

## Changes
- Show the full primary navigation across the top on desktop-sized screens.
- Keep the existing compact Tournament + More dropdown format on iPad and mobile widths.
- Ensure Stats remains a visible option inside the tablet/mobile More menu.
- Preserve signed-in account, upload, notification, LFG count, and sign-out behavior.

## Technical details
- Use the existing responsive breakpoints and navigation components; desktop switches at `lg`.
- Keep every destination as a TanStack Router link and retain existing accessibility labels and states.
- Verify the result at desktop and tablet/mobile widths.
