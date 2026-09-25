# Matchmaker levels and review tools

## Build
- Insert a new Level 4 using the wider 10-hour spacing fallback, then renumber the existing Hybrid and Near Match fallbacks to Levels 5 and 6.
- Add a player availability roster showing check-in state and a compact summary of each player's recorded availability.
- Let tournament hosts explicitly check players in or out from that roster, with loading feedback and confirmation; generated schedules remain browser-only drafts.
- Replace the compact result cards with the existing published-table availability map, while keeping suggested times, compatibility, and exports visible.

## Technical details
- Reuse the existing tournament availability heatmap so draft tables match the published table experience.
- Update only the selected registration row when a host deliberately changes a check-in toggle; do not save generated tables or schedules.
- Preserve current role checks, matchmaker controls, and both CSV export formats.
- Verify the six-level search and the new review interface in the browser at desktop and mobile widths.
