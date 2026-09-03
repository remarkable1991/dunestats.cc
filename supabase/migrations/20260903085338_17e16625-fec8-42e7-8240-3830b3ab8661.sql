CREATE OR REPLACE FUNCTION public.tournament_player_availability(p_tournament_num integer, p_player_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.player_availability
  FROM public.tournament_matches tm
  WHERE tm.tournament_num = p_tournament_num
    AND lower(trim(tm.player_name)) = lower(trim(p_player_name))
    AND tm.player_availability IS NOT NULL
    AND jsonb_typeof(tm.player_availability) = 'array'
    AND jsonb_array_length(tm.player_availability) > 0
  ORDER BY tm.created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.tournament_player_availability(integer, text) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.promote_to_grandfinal(p_tournament_num integer, p_players text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_existing integer;
  v_name text;
  v_discord text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  IF array_length(p_players, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Grand Final needs exactly 4 players.';
  END IF;

  SELECT count(*) INTO v_existing FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num
      AND round_type = 'Finals'
      AND table_identifier = 'Grand Final!';
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOREACH v_name IN ARRAY p_players LOOP
    SELECT discord_username INTO v_discord FROM public.tournament_matches
      WHERE tournament_num = p_tournament_num AND player_name = v_name
      LIMIT 1;
    INSERT INTO public.tournament_matches
      (tournament_num, round_type, table_identifier, player_name, discord_username, player_availability)
    VALUES
      (p_tournament_num, 'Finals', 'Grand Final!', v_name, v_discord,
       public.tournament_player_availability(p_tournament_num, v_name));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', 4);
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_to_semifinals_n(p_tournament_num integer, p_tables jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        (tournament_num, round_type, table_identifier, player_name, discord_username, player_availability)
      VALUES
        (p_tournament_num, 'Finals', v_label, v_name, v_discord,
         public.tournament_player_availability(p_tournament_num, v_name));
      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_to_semifinals(p_tournament_num integer, p_semi1 text[], p_semi2 text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.promote_to_semifinals_n(
    p_tournament_num,
    jsonb_build_array(to_jsonb(p_semi1), to_jsonb(p_semi2))
  );
END;
$function$;

-- Backfill availability for finals rows created before this change.
UPDATE public.tournament_matches tm
   SET player_availability = public.tournament_player_availability(tm.tournament_num, tm.player_name),
       updated_at = now()
 WHERE tm.round_type = 'Finals'
   AND (tm.player_availability IS NULL
        OR jsonb_typeof(tm.player_availability) <> 'array'
        OR jsonb_array_length(tm.player_availability) = 0)
   AND public.tournament_player_availability(tm.tournament_num, tm.player_name) IS NOT NULL;