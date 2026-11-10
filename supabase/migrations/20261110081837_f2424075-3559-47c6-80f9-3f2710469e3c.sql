BEGIN;
DO $$
DECLARE v record;
BEGIN
 FOR v IN SELECT g.id guest_id,a.id account_id,g.has_checked_in,g.check_in_method,g.checked_in_at FROM public.tournament_registrations g JOIN public.tournament_registrations a ON a.tournament_num=g.tournament_num AND lower(btrim(a.direwolf_name))=lower(btrim(g.direwolf_name)) AND a.user_id IS NOT NULL WHERE g.tournament_num=20 AND g.user_id IS NULL AND lower(g.direwolf_name) IN ('diizz','lorenzo99') AND lower(g.discord_username)=lower(a.discord_username) AND a.updated_at>g.updated_at AND EXISTS (SELECT 1 FROM public.player_ratings pr WHERE pr.player_key=lower(btrim(a.direwolf_name)) AND pr.claimed_by=a.user_id)
 LOOP
 UPDATE public.tournament_registrations SET has_checked_in=COALESCE(has_checked_in,false) OR COALESCE(v.has_checked_in,false),check_in_method=COALESCE(check_in_method,v.check_in_method),checked_in_at=COALESCE(checked_in_at,v.checked_in_at) WHERE id=v.account_id;
 DELETE FROM public.tournament_registrations WHERE id=v.guest_id AND user_id IS NULL;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.reconcile_account_tournament_registration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.tournament_registrations%ROWTYPE; v_key text:=lower(btrim(NEW.direwolf_name));
BEGIN
 IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tournament-registration:'||NEW.tournament_num||':'||v_key,0));
 SELECT * INTO g FROM public.tournament_registrations WHERE tournament_num=NEW.tournament_num AND user_id IS NULL AND lower(btrim(direwolf_name))=v_key FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key=v_key AND claimed_by=auth.uid()) OR EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key=v_key AND claimed_by IS NOT NULL AND claimed_by<>auth.uid()) THEN
 RAISE EXCEPTION 'An existing guest registration uses this name. Claim your in-game name or ask tournament staff to reconcile it before registering again.';
 END IF;
 NEW.has_checked_in:=COALESCE(NEW.has_checked_in,false) OR COALESCE(g.has_checked_in,false);
 NEW.check_in_method:=COALESCE(NEW.check_in_method,g.check_in_method);
 NEW.checked_in_at:=COALESCE(NEW.checked_in_at,g.checked_in_at);
 DELETE FROM public.tournament_registrations WHERE id=g.id AND user_id IS NULL;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_account_tournament_registration() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reconcile_account_tournament_registration BEFORE INSERT OR UPDATE OF direwolf_name,user_id ON public.tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.reconcile_account_tournament_registration();
CREATE OR REPLACE FUNCTION public.register_tournament_guest(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_num int:=(p->>'tournament_num')::int; v_name text:=btrim(p->>'direwolf_name');
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Signed-in players must use account registration'; END IF;
 IF v_name IS NULL OR v_name='' OR length(v_name)>100 THEN RAISE EXCEPTION 'In-game name required (maximum 100 characters)'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE tournament_num=v_num AND registration_open) THEN RAISE EXCEPTION 'Registration is closed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tournament-registration:'||v_num||':'||lower(v_name),0));
 IF EXISTS (SELECT 1 FROM public.tournament_registrations WHERE tournament_num=v_num AND user_id IS NOT NULL AND lower(btrim(direwolf_name))=lower(v_name)) THEN RAISE EXCEPTION 'This name already has an account registration. Sign in to update it.'; END IF;
 SELECT id INTO v_id FROM public.tournament_registrations WHERE tournament_num=v_num AND user_id IS NULL AND lower(direwolf_name)=lower(v_name) FOR UPDATE;
 IF v_id IS NULL THEN
 INSERT INTO public.tournament_registrations(tournament_num,direwolf_name,email,discord_username,owns_expansions,active_on_discord,consents,availability,timezone) VALUES(v_num,v_name,NULLIF(p->>'email',''),COALESCE(p->>'discord_username',''),COALESCE((p->>'owns_expansions')::boolean,false),COALESCE((p->>'active_on_discord')::boolean,false),COALESCE(p->'consents','{}'::jsonb),COALESCE(p->'availability','[]'::jsonb),p->>'timezone') RETURNING id INTO v_id;
 ELSE
 UPDATE public.tournament_registrations SET email=NULLIF(p->>'email',''),discord_username=COALESCE(p->>'discord_username',''),owns_expansions=COALESCE((p->>'owns_expansions')::boolean,false),active_on_discord=COALESCE((p->>'active_on_discord')::boolean,false),consents=COALESCE(p->'consents','{}'::jsonb),availability=COALESCE(p->'availability','[]'::jsonb),timezone=p->>'timezone',updated_at=now() WHERE id=v_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',v_id);
END $$;
COMMIT;