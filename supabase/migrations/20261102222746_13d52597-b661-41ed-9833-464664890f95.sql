ALTER TABLE public.active_async_matches
  ALTER COLUMN season_id SET DEFAULT COALESCE(public.sp_season_for(now()), 0),
  ALTER COLUMN season_num SET DEFAULT COALESCE(public.sp_season_for(now()), 0);

CREATE OR REPLACE FUNCTION public.lfg_assign_active_season()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_season integer;
BEGIN
  v_season := public.sp_season_for(COALESCE(NEW.created_at, now()));
  IF v_season IS NOT NULL THEN
    NEW.season_id := v_season;
    NEW.season_num := v_season;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lfg_assign_active_season ON public.active_async_matches;
CREATE TRIGGER trg_lfg_assign_active_season
BEFORE INSERT ON public.active_async_matches
FOR EACH ROW EXECUTE FUNCTION public.lfg_assign_active_season();