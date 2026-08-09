ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS semifinal_tables integer,
  ADD COLUMN IF NOT EXISTS grand_final_spots integer;

CREATE OR REPLACE FUNCTION public.promote_to_semifinals_n(p_tournament_num integer, p_tables jsonb)
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
  v_idx integer;
  v_label text;
  v_name text;
  v_discord text;
  v_inserted integer := 0;
  v_players jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  IF jsonb_typeof(p_tables) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tables) = 0 THEN
    RAISE EXCEPTION 'No semi final tables supplied.';
  END IF;

  SELECT count(*) INTO v_incomplete
  FROM (
    SELECT round_type, table_identifier
    FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num
      AND round_type = ANY(v_league_rounds)
    GROUP BY round_type, table_identifier
    HAVING count(*) FILTER (WHERE placement IS NOT NULL AND points IS NOT NULL) < 4
  ) t;

  IF v_incomplete > 0 THEN
    RAISE EXCEPTION 'League phase is not complete yet.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num AND round_type = ANY(v_league_rounds)
  ) THEN
    RAISE EXCEPTION 'No league phase data found.';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.tournament_matches
  WHERE tournament_num = p_tournament_num
    AND round_type = 'Finals'
    AND table_identifier ILIKE 'Semi Final%';

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOR v_idx IN 0..(jsonb_array_length(p_tables) - 1) LOOP
    v_players := p_tables -> v_idx;
    v_label := 'Semi Final ' || (v_idx + 1);
    FOR v_name IN SELECT jsonb_array_elements_text(v_players) LOOP
      SELECT discord_username INTO v_discord
      FROM public.tournament_matches
      WHERE tournament_num = p_tournament_num AND player_name = v_name
      LIMIT 1;

      INSERT INTO public.tournament_matches
        (tournament_num, round_type, table_identifier, player_name, discord_username)
      VALUES
        (p_tournament_num, 'Finals', v_label, v_name, v_discord);
      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_semifinals_n(integer, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_to_semifinals_n(integer, jsonb) TO authenticated;