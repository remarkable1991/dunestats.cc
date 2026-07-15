Change the tournament hub card progress from "rows completed / rows published" to **tables (games) completed / tables published**.

## Behavior

For each active tournament card:
- Group `tournament_matches` rows by `(round_type, table_identifier)`.
- A table counts as **completed** when it has 4 rows with both `placement` and `points` set.
- The **total** is the number of published tables (league + any semis/grand rows that exist in the DB).
- Display "`completed`/`total`" with the same percentage bar.

## Resulting numbers (T14 today)

- League: 21/21 tables done
- Semis: 0/2 published but empty
- Grand: not yet published
- Card reads **21/23** until semis are filled, then **23/24** once Grand Finals auto-publishes, then **24/24** at the end.

## Files

- `src/routes/tournament.tsx` — in `CurrentTournamentsHub`'s `useEffect` (around lines 955–985), replace the row-based `total`/`completed`/`pct` calculation with a table-grouped one. Everything else (phase logic, mode badges, UI) stays the same.