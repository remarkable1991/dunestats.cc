WITH cand AS (
  SELECT m.id, min(pr.player_key) AS k, count(DISTINCT pr.player_key) n
  FROM player_discord_map m
  JOIN player_ratings pr ON regexp_replace(pr.player_key,'[^a-z0-9]','','g') = regexp_replace(lower(m.player_key),'[^a-z0-9]','','g')
  WHERE m.player_key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM player_ratings p WHERE p.player_key = m.player_key)
  GROUP BY m.id
)
UPDATE player_discord_map m SET player_key = c.k, updated_at = now()
FROM cand c
WHERE m.id = c.id AND c.n = 1
  AND NOT EXISTS (SELECT 1 FROM player_discord_map o WHERE o.player_key = c.k AND o.id <> m.id);