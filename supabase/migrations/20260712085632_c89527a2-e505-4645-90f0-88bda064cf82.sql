
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sp_checkin_at timestamptz;

CREATE OR REPLACE FUNCTION public.sp_on_game_result_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_created timestamptz;
BEGIN
  SELECT created_at INTO v_created FROM public.games WHERE id = NEW.game_id;
  PERFORM public.sp_award(NEW.player_name, 'match_participation', 20, COALESCE(v_created, now()), NEW.game_id, NULL, NULL);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sp_game_result_award ON public.game_results;
CREATE TRIGGER sp_game_result_award AFTER INSERT ON public.game_results
  FOR EACH ROW EXECUTE FUNCTION public.sp_on_game_result_insert();

CREATE OR REPLACE FUNCTION public.sp_on_tournament_match_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prelim_count int;
BEGIN
  IF NEW.placement = 1 AND NEW.round_type IN ('Game 1','Game 2','Game 3','Game 4','Game 5') THEN
    PERFORM public.sp_award(NEW.player_name, 'tournament_round_win', 30, NEW.created_at, NULL, NEW.tournament_num, jsonb_build_object('round', NEW.round_type));
  END IF;
  IF NEW.round_type IN ('Semi-Finals','Semifinals','Semis') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sp_events
      WHERE player_key = lower(btrim(NEW.player_name))
        AND action_type = 'tournament_semi_finals_reached'
        AND ref_tournament_num = NEW.tournament_num
    ) THEN
      PERFORM public.sp_award(NEW.player_name, 'tournament_semi_finals_reached', 150, NEW.created_at, NULL, NEW.tournament_num, NULL);
    END IF;
  END IF;
  IF NEW.round_type = 'Finals' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sp_events
      WHERE player_key = lower(btrim(NEW.player_name))
        AND action_type = 'tournament_grand_finals_reached'
        AND ref_tournament_num = NEW.tournament_num
    ) THEN
      PERFORM public.sp_award(NEW.player_name, 'tournament_grand_finals_reached', 300, NEW.created_at, NULL, NEW.tournament_num, NULL);
    END IF;
    IF NEW.placement = 1 THEN
      PERFORM public.sp_award(NEW.player_name, 'tournament_grand_finals_won', 500, NEW.created_at, NULL, NEW.tournament_num, NULL);
    END IF;
  END IF;
  IF NEW.round_type IN ('Game 1','Game 2','Game 3','Game 4','Game 5') THEN
    SELECT COUNT(DISTINCT round_type) INTO v_prelim_count
    FROM public.tournament_matches
    WHERE lower(btrim(player_name)) = lower(btrim(NEW.player_name))
      AND tournament_num = NEW.tournament_num
      AND round_type IN ('Game 1','Game 2','Game 3','Game 4','Game 5');
    IF v_prelim_count = 5 AND NOT EXISTS (
      SELECT 1 FROM public.sp_events
      WHERE player_key = lower(btrim(NEW.player_name))
        AND action_type = 'tournament_completion'
        AND ref_tournament_num = NEW.tournament_num
    ) THEN
      PERFORM public.sp_award(NEW.player_name, 'tournament_completion', 100, NEW.created_at, NULL, NEW.tournament_num, NULL);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sp_tournament_match_award ON public.tournament_matches;
CREATE TRIGGER sp_tournament_match_award AFTER INSERT ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.sp_on_tournament_match_insert();

CREATE OR REPLACE FUNCTION public.sp_daily_checkin()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_player_key text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'unauthenticated');
  END IF;
  SELECT last_sp_checkin_at INTO v_last FROM public.profiles WHERE id = v_user;
  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_checked_in', 'next_at', v_last + interval '24 hours');
  END IF;
  UPDATE public.profiles SET last_sp_checkin_at = now(), updated_at = now() WHERE id = v_user;
  SELECT player_key INTO v_player_key
  FROM public.player_ratings
  WHERE claimed_by = v_user
  ORDER BY elo DESC
  LIMIT 1;
  IF v_player_key IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_claimed_player', 'amount', 5);
  END IF;
  PERFORM public.sp_award(v_player_key, 'daily_check_in', 5, now(), NULL, NULL, NULL);
  RETURN jsonb_build_object('awarded', true, 'amount', 5, 'player_key', v_player_key);
END; $$;

REVOKE ALL ON FUNCTION public.sp_daily_checkin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_daily_checkin() TO authenticated;
