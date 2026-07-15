
CREATE OR REPLACE FUNCTION public.promote_to_semifinals(
  p_tournament_num integer,
  p_semi1 text[],
  p_semi2 text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_league_rounds text[] := ARRAY['Game 1','Game 2','Game 3'];
  v_incomplete integer;
  v_existing integer;
  v_name text;
  v_discord text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  IF array_length(p_semi1, 1) IS DISTINCT FROM 4 OR array_length(p_semi2, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Each semi final must have exactly 4 players.';
  END IF;

  -- Verify league phase complete: every table in Game 1/2/3 has 4 ranked placements.
  SELECT count(*) INTO v_incomplete
  FROM (
    SELECT round_type, table_identifier,
           count(*) FILTER (WHERE placement IS NOT NULL AND points IS NOT NULL) AS ranked
    FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num
      AND round_type = ANY(v_league_rounds)
    GROUP BY round_type, table_identifier
    HAVING count(*) FILTER (WHERE placement IS NOT NULL AND points IS NOT NULL) < 4
  ) t;

  IF v_incomplete > 0 THEN
    RAISE EXCEPTION 'League phase is not complete yet.';
  END IF;

  -- Also ensure there is at least one league match (avoid promoting empty tournaments).
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num AND round_type = ANY(v_league_rounds)
  ) THEN
    RAISE EXCEPTION 'No league phase data found.';
  END IF;

  -- Skip if semi rows already exist.
  SELECT count(*) INTO v_existing
  FROM public.tournament_matches
  WHERE tournament_num = p_tournament_num
    AND round_type = 'Finals'
    AND table_identifier IN ('Semi Final 1','Semi Final 2');

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Insert Semi Final 1
  FOREACH v_name IN ARRAY p_semi1 LOOP
    SELECT discord_username INTO v_discord
    FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num AND player_name = v_name
    LIMIT 1;

    INSERT INTO public.tournament_matches
      (tournament_num, round_type, table_identifier, player_name, discord_username)
    VALUES
      (p_tournament_num, 'Finals', 'Semi Final 1', v_name, v_discord);
  END LOOP;

  -- Insert Semi Final 2
  FOREACH v_name IN ARRAY p_semi2 LOOP
    SELECT discord_username INTO v_discord
    FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num AND player_name = v_name
    LIMIT 1;

    INSERT INTO public.tournament_matches
      (tournament_num, round_type, table_identifier, player_name, discord_username)
    VALUES
      (p_tournament_num, 'Finals', 'Semi Final 2', v_name, v_discord);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', 8);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_semifinals(integer, text[], text[]) TO authenticated;
