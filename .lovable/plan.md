# Fix Host now lobbies not reaching Discord or the LFG list

## What lobby 169 shows

- Lobby 169 was created with password `sa169`. Its status is still "waiting for Discord" (`pending_creation`), with a placeholder Discord message.
- The bot posts a website lobby only once: when the new row first appears. After posting, it marks the lobby "searching" and saves the real Discord message.
- For 169 the bot never finished that step. Lobby 166, made the same way yesterday without the password step, was posted fine.
- The likely cause: our password save changes the lobby a split second after it is created, while the bot is still posting it. The bot's "lobby changed" handler then tries to update a Discord message that doesn't exist yet. This is likely, not confirmed — only the bot's log can confirm it (check around 09:35 UTC today).
- The LFG list only shows lobbies the bot has posted ("searching"), so 169 never appeared there.

## Changes (website only, no database changes)

1. **Set the password after the bot posts.** Host now creates the lobby, then waits up to about 20 seconds for the bot to mark it "searching". Only then does it save `sa{id}`. The bot's existing change handler then updates the Discord post to show the password. If the bot doesn't respond in time, show a warning saying "Not posted to Discord yet" and don't save the password.
2. **Show lobbies waiting for Discord in the LFG list.** The list also includes `pending_creation` lobbies, but only to their host and LFG admins, with a "Posting to Discord…" badge. Players can open them, and the password editor works there too.
3. **Lobby 169:** it can't be re-posted from the website without changing the database or the bot. I'll show it in the list (step 2) so you can cancel it and press Host now again.

## Optional bot change (for whoever runs the bot)

- In the `active_async_matches` UPDATE handler, skip `syncLobbyEmbed` while `message_id` starts with `pending-web-`. On startup, post any `pending_creation` rows that were missed. Then a missed or interrupted post fixes itself.

## Technical details

- `MatchmakingQueuePanel.host`: after `lfg_create_lobby`, poll `active_async_matches.status` for the new id every 1.5s, up to 20s, then call `applyDefaultPassword`.
- `lfg.tsx` load query: `.in("status", ["searching","pending_creation"])`. Filter pending rows on the client to the host and admins. Add the badge in `LfgCard`.
