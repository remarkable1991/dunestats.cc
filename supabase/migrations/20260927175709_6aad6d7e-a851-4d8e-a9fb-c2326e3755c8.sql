CREATE TABLE public.player_season_sp (
  player_key text NOT NULL,
  season_id integer NOT NULL REFERENCES public.sp_seasons(id),
  seasonal_sp integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_key, season_id)
);
GRANT SELECT ON public.player_season_sp TO anon, authenticated;
GRANT ALL ON public.player_season_sp TO service_role;
ALTER TABLE public.player_season_sp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Season SP is public" ON public.player_season_sp FOR SELECT USING (true);
CREATE INDEX player_season_sp_season_idx ON public.player_season_sp(season_id, seasonal_sp DESC);

-- Season 1 snapshot from current totals
INSERT INTO public.player_season_sp (player_key, season_id, seasonal_sp)
SELECT player_key, 1, seasonal_sp FROM public.player_sp WHERE seasonal_sp <> 0
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sp_award(p_player_name text, p_action_type text, p_amount integer, p_at timestamp with time zone, p_ref_game_id uuid DEFAULT NULL::uuid, p_ref_tournament_num integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := lower(btrim(p_player_name));
  v_legacy boolean := p_at < '2026-07-01 00:00:00+00';
  v_season_id integer := COALESCE(public.sp_season_for(p_at), 1);
  v_award integer := CASE WHEN v_legacy THEN GREATEST(1, round(p_amount * 0.10)::int) ELSE p_amount END;
  v_seasonal integer := CASE WHEN v_legacy THEN 0 ELSE v_award END;
  v_display text := btrim(p_player_name);
BEGIN
  IF v_key = '' THEN RETURN; END IF;

  INSERT INTO public.sp_events (player_key, action_type, amount, is_legacy, season_id, ref_game_id, ref_tournament_num, metadata, created_at)
  VALUES (v_key, p_action_type, v_award, v_legacy, v_season_id, p_ref_game_id, p_ref_tournament_num, p_metadata, p_at);

  INSERT INTO public.player_sp (player_key, display_name, lifetime_sp, seasonal_sp, season_id, is_claimed, claimed_by)
  VALUES (
    v_key, v_display, v_award, v_seasonal, v_season_id,
    EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key = v_key AND claimed_by IS NOT NULL),
    (SELECT claimed_by FROM public.player_ratings WHERE player_key = v_key AND claimed_by IS NOT NULL LIMIT 1)
  )
  ON CONFLICT (player_key) DO UPDATE SET
    lifetime_sp = public.player_sp.lifetime_sp + EXCLUDED.lifetime_sp,
    seasonal_sp = CASE WHEN public.player_sp.season_id = EXCLUDED.season_id
                       THEN public.player_sp.seasonal_sp + EXCLUDED.seasonal_sp
                       ELSE EXCLUDED.seasonal_sp END,
    season_id = EXCLUDED.season_id,
    display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.player_sp.display_name),
    updated_at = now();

  IF v_seasonal <> 0 THEN
    INSERT INTO public.player_season_sp (player_key, season_id, seasonal_sp)
    VALUES (v_key, v_season_id, v_seasonal)
    ON CONFLICT (player_key, season_id) DO UPDATE SET
      seasonal_sp = public.player_season_sp.seasonal_sp + EXCLUDED.seasonal_sp,
      updated_at = now();
  END IF;
END;
$function$;

-- Season-aware achievements: derived from the existing function body
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.get_player_achievements(text)'::regprocedure) INTO d;
  d := replace(d, 'public.get_player_achievements(p_player_key text)', 'public.get_player_achievements_season(p_player_key text, p_season_id integer)');
  d := replace(d, 'v_season_start TIMESTAMPTZ := ''2026-07-01 00:00:00+00''::timestamptz;',
    'v_season_start TIMESTAMPTZ := ''2026-07-01 00:00:00+00''::timestamptz; v_season_end TIMESTAMPTZ := ''infinity''::timestamptz;');
  d := regexp_replace(d, 'BEGIN\s+SELECT start_date INTO v_season_start.*?END IF;',
    'SELECT starts_at, ends_at INTO v_season_start, v_season_end FROM public.sp_seasons WHERE id = COALESCE(p_season_id, public.sp_season_for(now()), 1);
    IF v_season_start IS NULL THEN v_season_start := ''2026-07-01 00:00:00+00''::timestamptz; v_season_end := ''infinity''::timestamptz; END IF;', 's');
  d := regexp_replace(d, '([A-Za-z_0-9\.]+) >= v_season_start', '(\1 >= v_season_start AND \1 < v_season_end)', 'g');
  EXECUTE d;
END
$do$;

CREATE OR REPLACE FUNCTION public.get_player_achievements(p_player_key text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT public.get_player_achievements_season(p_player_key, NULL::integer) $$;