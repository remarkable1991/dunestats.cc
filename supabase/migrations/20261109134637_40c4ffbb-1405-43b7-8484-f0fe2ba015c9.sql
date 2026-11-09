CREATE OR REPLACE FUNCTION public.lfg_played_history(
  p_search text DEFAULT '',
  p_mode text DEFAULT 'all',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      left(trim(coalesce(p_search, '')), 80) AS search,
      greatest(0, coalesce(p_page, 0)) AS page,
      least(24, greatest(1, coalesce(p_page_size, 12))) AS page_size
  ), filtered AS (
    SELECT a.*
    FROM public.active_async_matches a
    CROSS JOIN params p
    WHERE a.status IN ('started', 'reported', 'completed')
      AND (
        NOT coalesce(a.is_league, false)
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'lfg_admin')
      )
      AND (
        p_mode = 'all'
        OR (p_mode = 'league' AND a.is_league IS TRUE)
        OR (p_mode IN ('live', 'async') AND a.mode = p_mode)
        OR (p_mode = 'pending' AND a.is_league IS TRUE AND a.status = 'started' AND a.linked_game_id IS NULL AND a.created_at >= now() - interval '4 hours')
        OR (p_mode = 'unreported' AND a.is_league IS TRUE AND a.status = 'started' AND a.linked_game_id IS NULL AND a.created_at < now() - interval '4 hours')
      )
      AND (
        p.search = ''
        OR EXISTS (
          SELECT 1
          FROM unnest(
            coalesce(a.expected_player_keys, '{}'::text[])
            || coalesce(a.web_player_names, '{}'::text[])
            || coalesce(a.guest_players, '{}'::text[])
            || coalesce(a.discord_usernames, '{}'::text[])
          ) AS seated(name)
          WHERE seated.name ILIKE '%' || p.search || '%'
        )
        OR EXISTS (
          SELECT 1
          FROM public.player_discord_map m
          WHERE m.discord_user_id = ANY(array_append(coalesce(a.player_ids, '{}'::text[]), a.host_id))
            AND (
              coalesce(m.player_key, '') ILIKE '%' || p.search || '%'
              OR coalesce(m.display_name, '') ILIKE '%' || p.search || '%'
              OR coalesce(m.discord_username, '') ILIKE '%' || p.search || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.game_results gr
          WHERE gr.game_id = a.linked_game_id
            AND gr.player_name ILIKE '%' || p.search || '%'
        )
      )
  ), paged AS (
    SELECT f.*
    FROM filtered f, params p
    ORDER BY f.created_at DESC
    LIMIT (SELECT page_size FROM params)
    OFFSET (SELECT page * page_size FROM params)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM paged p), '[]'::jsonb),
    'count', (SELECT count(*) FROM filtered)
  );
$$;

REVOKE ALL ON FUNCTION public.lfg_played_history(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lfg_played_history(text, text, integer, integer) TO anon, authenticated, service_role;