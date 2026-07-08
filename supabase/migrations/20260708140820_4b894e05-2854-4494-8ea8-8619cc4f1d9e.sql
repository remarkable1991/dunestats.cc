CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.apply_rating_track_for_results(
  _track public.game_version,
  _results jsonb
)
RETURNS numeric[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := jsonb_array_length(_results);
  v_row jsonb;
  v_idx integer;
  v_key text;
  v_display text;
  v_placement integer;
  v_points integer;
  v_prev record;
  v_inherited_claim uuid;
  v_keys text[] := '{}';
  v_display_names text[] := '{}';
  v_placements integer[] := '{}';
  v_points_arr integer[] := '{}';
  v_current numeric[] := '{}';
  v_games_played integer[] := '{}';
  v_wins integer[] := '{}';
  v_top2 integer[] := '{}';
  v_total_points integer[] := '{}';
  v_claimed_by uuid[] := '{}';
  v_new_elos numeric[];
  v_deltas numeric[];
  v_expected numeric;
  v_score numeric;
  v_k numeric := 32;
  i integer;
  j integer;
BEGIN
  IF v_count IS NULL OR v_count < 2 OR v_count > 8 THEN
    RAISE EXCEPTION 'A match must include 2 to 8 players.';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_results) LOOP
    v_idx := COALESCE(array_length(v_keys, 1), 0) + 1;
    v_display := btrim(COALESCE(v_row->>'player_name', ''));
    v_key := lower(v_display);
    v_placement := (v_row->>'placement')::integer;
    v_points := (v_row->>'points')::integer;

    SELECT elo, games_played, wins, top2, total_points, claimed_by
    INTO v_prev
    FROM public.player_ratings
    WHERE player_key = v_key AND game_version = _track
    LIMIT 1;

    SELECT claimed_by
    INTO v_inherited_claim
    FROM public.player_ratings
    WHERE player_key = v_key AND claimed_by IS NOT NULL
    LIMIT 1;

    v_keys := array_append(v_keys, v_key);
    v_display_names := array_append(v_display_names, v_display);
    v_placements := array_append(v_placements, v_placement);
    v_points_arr := array_append(v_points_arr, v_points);
    v_current := array_append(v_current, COALESCE(v_prev.elo, 1000)::numeric);
    v_games_played := array_append(v_games_played, COALESCE(v_prev.games_played, 0));
    v_wins := array_append(v_wins, COALESCE(v_prev.wins, 0));
    v_top2 := array_append(v_top2, COALESCE(v_prev.top2, 0));
    v_total_points := array_append(v_total_points, COALESCE(v_prev.total_points, 0));
    v_claimed_by := array_append(v_claimed_by, COALESCE(v_prev.claimed_by, v_inherited_claim));
  END LOOP;

  v_new_elos := v_current;
  v_deltas := array_fill(0::numeric, ARRAY[v_count]);

  FOR i IN 1..v_count LOOP
    FOR j IN 1..v_count LOOP
      IF i <> j THEN
        v_expected := 1 / (1 + power(10, (v_current[j] - v_current[i]) / 400));
        v_score := CASE
          WHEN v_placements[i] < v_placements[j] THEN 1
          WHEN v_placements[i] = v_placements[j] THEN 0.5
          ELSE 0
        END;
        v_new_elos[i] := v_new_elos[i] + ((v_k / GREATEST(1, v_count - 1)) * (v_score - v_expected));
      END IF;
    END LOOP;
    v_new_elos[i] := round(v_new_elos[i], 2);
    v_deltas[i] := round(v_new_elos[i] - v_current[i], 4);
  END LOOP;

  FOR i IN 1..v_count LOOP
    INSERT INTO public.player_ratings (
      player_key,
      display_name,
      game_version,
      elo,
      games_played,
      wins,
      top2,
      total_points,
      claimed_by,
      updated_at
    ) VALUES (
      v_keys[i],
      v_display_names[i],
      _track,
      v_new_elos[i],
      v_games_played[i] + 1,
      v_wins[i] + CASE WHEN v_placements[i] = 1 THEN 1 ELSE 0 END,
      v_top2[i] + CASE WHEN v_placements[i] <= 2 THEN 1 ELSE 0 END,
      v_total_points[i] + v_points_arr[i],
      v_claimed_by[i],
      now()
    )
    ON CONFLICT (player_key, game_version) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      elo = EXCLUDED.elo,
      games_played = EXCLUDED.games_played,
      wins = EXCLUDED.wins,
      top2 = EXCLUDED.top2,
      total_points = EXCLUDED.total_points,
      claimed_by = COALESCE(public.player_ratings.claimed_by, EXCLUDED.claimed_by),
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  RETURN v_deltas;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_rating_track_for_results(public.game_version, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.save_game_with_ratings(
  p_board_version text,
  p_has_rise_of_ix boolean,
  p_has_epic_mode boolean,
  p_has_immortality boolean,
  p_has_base_leaders boolean,
  p_match_screenshot_url text,
  p_tournament_num integer,
  p_results jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_game_version public.game_version;
  v_game_id uuid;
  v_count integer;
  v_row jsonb;
  v_player_name text;
  v_player_key text;
  v_leader_name text;
  v_placement integer;
  v_points integer;
  v_seen_keys text[] := '{}';
  v_version_deltas numeric[];
  v_overall_deltas numeric[];
  v_deltas jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  IF p_board_version NOT IN ('base', 'uprising') THEN
    RAISE EXCEPTION 'Invalid board version.';
  END IF;

  IF p_match_screenshot_url IS NOT NULL AND length(p_match_screenshot_url) > 500 THEN
    RAISE EXCEPTION 'Screenshot URL is too long.';
  END IF;

  IF jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Results must be a list.';
  END IF;

  v_count := jsonb_array_length(p_results);
  IF v_count < 2 OR v_count > 8 THEN
    RAISE EXCEPTION 'A match must include 2 to 8 players.';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    v_player_name := btrim(COALESCE(v_row->>'player_name', ''));
    v_player_key := lower(v_player_name);
    v_leader_name := NULLIF(btrim(COALESCE(v_row->>'leader_name', '')), '');
    v_placement := (v_row->>'placement')::integer;
    v_points := (v_row->>'points')::integer;

    IF v_player_name = '' OR length(v_player_name) > 64 THEN
      RAISE EXCEPTION 'Player names must be 1 to 64 characters.';
    END IF;

    IF v_leader_name IS NOT NULL AND length(v_leader_name) > 120 THEN
      RAISE EXCEPTION 'Leader names must be 120 characters or fewer.';
    END IF;

    IF v_placement < 1 OR v_placement > 8 THEN
      RAISE EXCEPTION 'Placements must be between 1 and 8.';
    END IF;

    IF v_points < 0 OR v_points > 99 THEN
      RAISE EXCEPTION 'Points must be between 0 and 99.';
    END IF;

    IF v_player_key = ANY(v_seen_keys) THEN
      RAISE EXCEPTION 'Each player can appear only once per match.';
    END IF;
    v_seen_keys := array_append(v_seen_keys, v_player_key);
  END LOOP;

  v_game_version := CASE
    WHEN p_board_version = 'uprising' THEN 'uprising'::public.game_version
    WHEN p_has_rise_of_ix THEN 'ix'::public.game_version
    ELSE 'base'::public.game_version
  END;

  INSERT INTO public.games (
    game_version,
    board_version,
    has_rise_of_ix,
    has_epic_mode,
    has_immortality,
    has_base_leaders,
    image_url,
    source,
    created_by,
    tournament_num
  ) VALUES (
    v_game_version,
    p_board_version,
    COALESCE(p_has_rise_of_ix, false),
    COALESCE(p_has_epic_mode, false),
    COALESCE(p_has_immortality, false),
    COALESCE(p_has_base_leaders, false),
    p_match_screenshot_url,
    'screenshot',
    v_user_id,
    p_tournament_num
  )
  RETURNING id INTO v_game_id;

  v_version_deltas := private.apply_rating_track_for_results(v_game_version, p_results);
  v_overall_deltas := private.apply_rating_track_for_results('overall'::public.game_version, p_results);

  INSERT INTO public.game_results (
    game_id,
    placement,
    player_name,
    leader_name,
    points,
    elo_delta,
    elo_delta_overall
  )
  SELECT
    v_game_id,
    (value->>'placement')::integer,
    btrim(value->>'player_name'),
    NULLIF(btrim(COALESCE(value->>'leader_name', '')), ''),
    (value->>'points')::integer,
    v_version_deltas[ordinality::integer],
    v_overall_deltas[ordinality::integer]
  FROM jsonb_array_elements(p_results) WITH ORDINALITY;

  SELECT jsonb_agg(
    jsonb_build_object(
      'player_name', btrim(value->>'player_name'),
      'placement', (value->>'placement')::integer,
      'version_delta', v_version_deltas[ordinality::integer],
      'overall_delta', v_overall_deltas[ordinality::integer]
    )
    ORDER BY (value->>'placement')::integer
  )
  INTO v_deltas
  FROM jsonb_array_elements(p_results) WITH ORDINALITY;

  RETURN jsonb_build_object(
    'game_id', v_game_id,
    'game_version', v_game_version::text,
    'tournament_num', p_tournament_num,
    'deltas', COALESCE(v_deltas, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_game_with_ratings(text, boolean, boolean, boolean, boolean, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_game_with_ratings(text, boolean, boolean, boolean, boolean, text, integer, jsonb) TO authenticated;