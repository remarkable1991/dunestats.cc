# Update the LFG Matchmaking Hub

## Create LFG dialog

- Show a prominent live preview reading `Lobby Name: [IGN]'s Game` above the form.
- Add a read-only In-Game Name field populated from the existing signed-in player lookup.
- Change the starting expiry values to 15 hours for ASync and 180 minutes for Live.
- Add an optional comma-separated Guest players field, accepting at most two non-empty names and showing a clear error if more are entered.
- Extend lobby creation so the validated guest names are saved in `active_async_matches.guest_players`; guest seats continue to count toward the four-player limit.

## Lobby cards

- Resolve the host from the first web player name, otherwise from the Discord mapping for `host_id`.
- Show `[Host Name]'s Game [ID: …]` when resolved, or `New Match Open! [ID: …]` when not.
- Replace the text-heavy Discord link with a recognizable Discord icon button, retaining an accessible label and external-link behavior.

## Ping and quick chat

- Remove “Need 1 more” from Quick Chat and add `📛 What is the lobby name?` using `lobby_name_ask`.
- Add a separate `📢 Ping Role` action for seated players.
- Read `last_prompted_at`, enforce a 45-minute client-side cooldown, and display a live `Available in MM:SS` countdown while disabled.
- On a successful ping, insert `message_code: 'ping'` and immediately start the local cooldown while Realtime keeps the card synchronized with backend updates.

## Validation

- Verify the dialog, title fallback, guest-seat rendering, chat menu, ping cooldown, and Discord action in desktop and mobile-sized browser views.
- Confirm the current preview build has no errors after the database and page updates.

## Technical details

- Update the existing Supabase lobby-creation function through a migration, preserving authentication and IGN checks and limiting the guest array to two trimmed names.
- Keep all lobby actions behind the existing signed-in/RLS paths and use the current Realtime subscription cleanup pattern.
- Use the existing design tokens and button components; the Discord mark will be an inline accessible SVG so no additional icon package is needed.
