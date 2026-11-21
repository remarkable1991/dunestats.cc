ALTER TABLE public.tournaments ADD COLUMN league_season_id integer REFERENCES public.sp_seasons(id), ADD COLUMN min_league_games integer NOT NULL DEFAULT 0, ADD COLUMN hide_tournament_number boolean NOT NULL DEFAULT false, ADD COLUMN format_tbd boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX tournaments_league_season_unique ON public.tournaments(league_season_id) WHERE league_season_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.enforce_tournament_league_eligibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.tournaments%ROWTYPE; played integer;
BEGIN
 SELECT * INTO cfg FROM public.tournaments WHERE tournament_num=NEW.tournament_num;
 IF cfg.league_season_id IS NULL OR cfg.min_league_games<=0 THEN RETURN NEW; END IF;
 IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Sign in and use your claimed in-game name to register for this League tournament.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.player_ratings WHERE player_key=lower(btrim(NEW.direwolf_name)) AND claimed_by=NEW.user_id) THEN RAISE EXCEPTION 'Use an in-game name claimed by this registration account.'; END IF;
 SELECT COALESCE(games_played,0) INTO played FROM public.player_league_ratings WHERE player_key=lower(btrim(NEW.direwolf_name)) AND season=cfg.league_season_id;
 IF COALESCE(played,0)<cfg.min_league_games THEN RAISE EXCEPTION 'Requires % League games in Season %; this player has %.',cfg.min_league_games,cfg.league_season_id,COALESCE(played,0); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_tournament_league_eligibility() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_tournament_league_eligibility BEFORE INSERT OR UPDATE OF tournament_num,direwolf_name,user_id ON public.tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_league_eligibility();
INSERT INTO public.tournaments(tournament_num,name,start_date,end_date,required_availability_pct,required_weekly_pct,checkboxes,info_title,info_text,registration_open,board_version,has_rise_of_ix,has_epic_mode,has_immortality,has_base_leaders,play_mode,league_season_id,min_league_games,hide_tournament_number,format_tbd)
VALUES ((SELECT COALESCE(MAX(tournament_num),0)+1 FROM public.tournaments),'End of Season 1 Tournament','2027-01-25','2027-02-28',0,0,'[{"id":"active_on_discord","label":"I am active on the Strategy Arena Discord server."}]'::jsonb,'End of Season 1 Tournament','Community-funded prizes celebrate the end of Season 1. Registration is open to players with at least 10 League games in Season 1. Share your availability for January 25–February 28, 2027. Format and exact match dates are TBD.',true,'uprising',false,false,false,false,'live',1,10,true,true);