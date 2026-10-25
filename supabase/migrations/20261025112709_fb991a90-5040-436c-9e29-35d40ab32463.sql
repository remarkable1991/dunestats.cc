CREATE TABLE public.lfg_alert_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 browser_enabled boolean NOT NULL DEFAULT false,
 sound_enabled boolean NOT NULL DEFAULT false,
 discord_openings boolean NOT NULL DEFAULT false,
 event_kinds text[] NOT NULL DEFAULT ARRAY['own_open','full','chat','result'],
 lobby_scope text NOT NULL DEFAULT 'league' CHECK (lobby_scope IN ('league','live','async','all')),
 email_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (event_kinds <@ ARRAY['opening','own_open','roster','full','chat','result']::text[])
);
GRANT SELECT,INSERT,UPDATE ON public.lfg_alert_preferences TO authenticated;
GRANT ALL ON public.lfg_alert_preferences TO service_role;
ALTER TABLE public.lfg_alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY lfg_alert_preferences_own ON public.lfg_alert_preferences FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE FUNCTION public.lfg_alert_preferences_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.email_until IS NOT NULL AND NEW.email_until > now()+interval '4 hours' THEN RAISE EXCEPTION 'Email alerts may be enabled for at most four hours'; END IF;
 NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER lfg_alert_preferences_guard BEFORE INSERT OR UPDATE ON public.lfg_alert_preferences FOR EACH ROW EXECUTE FUNCTION public.lfg_alert_preferences_guard();

CREATE TABLE public.lfg_alert_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 lobby_id bigint NOT NULL REFERENCES public.active_async_matches(id), event_key text NOT NULL,
 kind text NOT NULL, title text NOT NULL, body text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','browser_pending','browser_received','email_sending','email_sent','suppressed')),
 browser_received_at timestamptz, email_sent_at timestamptz, email_due_at timestamptz NOT NULL DEFAULT now()+interval '3 minutes',
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,event_key)
);
GRANT SELECT ON public.lfg_alert_deliveries TO authenticated;
GRANT ALL ON public.lfg_alert_deliveries TO service_role;
ALTER TABLE public.lfg_alert_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY lfg_alert_deliveries_own ON public.lfg_alert_deliveries FOR SELECT TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.active_async_matches a WHERE a.id=lobby_id));
CREATE INDEX lfg_alert_due ON public.lfg_alert_deliveries(state,email_due_at);

CREATE FUNCTION public.lfg_alert_emit(p_lobby bigint,p_kind text,p_key text,p_title text,p_body text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.active_async_matches; p public.lfg_alert_preferences;
BEGIN
 SELECT * INTO r FROM public.active_async_matches WHERE id=p_lobby;
 FOR p IN SELECT * FROM public.lfg_alert_preferences LOOP
  IF NOT p_kind=ANY(p.event_kinds) THEN CONTINUE; END IF;
  IF COALESCE(r.is_league,false) AND NOT (public.has_role(p.user_id,'admin') OR public.has_role(p.user_id,'lfg_admin')) THEN CONTINUE; END IF;
  IF p_kind='opening' THEN
   IF p.lobby_scope='league' AND NOT COALESCE(r.is_league,false) THEN CONTINUE; END IF;
   IF p.lobby_scope IN ('live','async') AND lower(COALESCE(r.mode,'async'))<>p.lobby_scope THEN CONTINUE; END IF;
   IF public.lfg_is_member(r,p.user_id) OR EXISTS(SELECT 1 FROM public.active_async_matches a WHERE a.status IN ('pending_creation','posting','searching','started') AND public.lfg_is_member(a,p.user_id)) THEN CONTINUE; END IF;
  ELSIF NOT public.lfg_is_member(r,p.user_id) THEN CONTINUE;
  END IF;
  INSERT INTO public.lfg_alert_deliveries(user_id,lobby_id,event_key,kind,title,body) VALUES(p.user_id,p_lobby,p_key,p_kind,p_title,p_body) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.lfg_alert_emit(bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_alert_emit(bigint,text,text,text,text) TO service_role;

CREATE FUNCTION public.lfg_roster_tokens(p_row public.active_async_matches) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(array_agg(DISTINCT token ORDER BY token),'{}'::text[]) FROM (
 SELECT 'player:'||COALESCE((SELECT m.player_key FROM public.player_discord_map m WHERE m.discord_user_id=d LIMIT 1),'discord:'||d) token FROM unnest(COALESCE(p_row.player_ids,'{}'::text[])) d
 UNION ALL SELECT 'player:'||COALESCE((SELECT m.player_key FROM public.player_discord_map m WHERE m.claimed_by=u LIMIT 1),lower(COALESCE(p_row.web_player_names[array_position(p_row.web_player_ids,u)],u::text))) FROM unnest(COALESCE(p_row.web_player_ids,'{}'::uuid[])) u
 UNION ALL SELECT 'player:'||lower(trim(g)) FROM unnest(COALESCE(p_row.guest_players,'{}'::text[])) g WHERE trim(g)<>''
 ) s;
$$;
REVOKE ALL ON FUNCTION public.lfg_roster_tokens(public.active_async_matches) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_roster_tokens(public.active_async_matches) TO service_role;

CREATE TABLE public.lfg_three_player_votes (
 lobby_id bigint PRIMARY KEY REFERENCES public.active_async_matches(id), roster text[] NOT NULL, approvals text[] NOT NULL DEFAULT '{}',
 requested_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lfg_three_player_votes TO authenticated;
GRANT ALL ON public.lfg_three_player_votes TO service_role;
ALTER TABLE public.lfg_three_player_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY lfg_vote_visible ON public.lfg_three_player_votes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.active_async_matches a WHERE a.id=lobby_id));

CREATE FUNCTION public.lfg_vote_three(p_id bigint,p_agree boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.active_async_matches; v public.lfg_three_player_votes; roster text[]; token text; uid uuid=auth.uid(); ign text;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Not signed in'); END IF;
 SELECT * INTO r FROM public.active_async_matches WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.lfg_is_member(r,uid) THEN RETURN jsonb_build_object('ok',false,'error','Only seated players can vote'); END IF;
 IF NOT COALESCE(r.is_league,false) OR r.status<>'searching' OR r.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'error','This lobby is not open for a League vote'); END IF;
 roster=public.lfg_roster_tokens(r);
 IF cardinality(roster)<>3 THEN RETURN jsonb_build_object('ok',false,'error','A three-player vote requires exactly three players'); END IF;
 SELECT 'player:'||m.player_key INTO token FROM public.player_discord_map m WHERE m.claimed_by=uid AND (m.discord_user_id=ANY(COALESCE(r.player_ids,'{}')) OR uid=ANY(COALESCE(r.web_player_ids,'{}'))) LIMIT 1;
 IF token IS NULL THEN token='player:'||lower(COALESCE(r.web_player_names[array_position(r.web_player_ids,uid)],uid::text)); END IF;
 IF NOT token=ANY(roster) THEN RETURN jsonb_build_object('ok',false,'error','Your seat could not be verified'); END IF;
 SELECT * INTO v FROM public.lfg_three_player_votes WHERE lobby_id=p_id;
 IF NOT FOUND OR v.roster<>roster THEN
  IF p_agree THEN RETURN jsonb_build_object('ok',false,'error','Request a new vote first'); END IF;
  INSERT INTO public.lfg_three_player_votes(lobby_id,roster,approvals) VALUES(p_id,roster,ARRAY[token]) ON CONFLICT(lobby_id) DO UPDATE SET roster=EXCLUDED.roster,approvals=EXCLUDED.approvals,requested_at=now(),updated_at=now();
  INSERT INTO public.lobby_quick_chats(lobby_id,sender_name,message_code) VALUES(p_id,COALESCE(public.lfg_my_ign(),'Web player'),'start_3p_ask');
 ELSE
  IF NOT token=ANY(v.approvals) THEN
   UPDATE public.lfg_three_player_votes SET approvals=array_append(approvals,token),updated_at=now() WHERE lobby_id=p_id;
   INSERT INTO public.lobby_quick_chats(lobby_id,sender_name,message_code) VALUES(p_id,COALESCE(public.lfg_my_ign(),'Web player'),'agree_3p');
  END IF;
 END IF;
 SELECT * INTO v FROM public.lfg_three_player_votes WHERE lobby_id=p_id;
 IF cardinality(v.approvals)=3 THEN UPDATE public.active_async_matches SET status='started',auto_start_at=NULL WHERE id=p_id; END IF;
 RETURN jsonb_build_object('ok',true,'started',cardinality(v.approvals)=3);
END $$;
REVOKE ALL ON FUNCTION public.lfg_vote_three(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lfg_vote_three(bigint,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.lfg_start_game(p_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.active_async_matches; n integer;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Not signed in'); END IF;
 SELECT * INTO r FROM public.active_async_matches WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.lfg_is_member(r,auth.uid()) THEN RETURN jsonb_build_object('ok',false,'error','Only seated players can start this game'); END IF;
 IF r.status<>'searching' OR r.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'error','This lobby is no longer open'); END IF;
 n=cardinality(public.lfg_roster_tokens(r));
 IF COALESCE(r.is_league,false) THEN
  IF n<3 THEN RETURN jsonb_build_object('ok',false,'error','League requires at least three players'); END IF;
  IF n=3 THEN RETURN public.lfg_vote_three(p_id,false); END IF;
 END IF;
 UPDATE public.active_async_matches SET status='started',auto_start_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('ok',true,'started',true);
END $$;

CREATE FUNCTION public.lfg_alert_lobby_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE key text=gen_random_uuid()::text; n integer; old_n integer=0; v public.lfg_three_player_votes;
BEGIN
 n=cardinality(public.lfg_roster_tokens(NEW));
 IF TG_OP='UPDATE' THEN
  old_n=cardinality(public.lfg_roster_tokens(OLD));
  IF public.lfg_roster_tokens(OLD)<>public.lfg_roster_tokens(NEW) THEN
   DELETE FROM public.lfg_three_player_votes WHERE lobby_id=NEW.id;
   IF NEW.status='searching' THEN PERFORM public.lfg_alert_emit(NEW.id,'roster',key||':roster','Lobby roster changed','Your lobby now has '||n||'/4 players.'); END IF;
  END IF;
 END IF;
 IF NEW.status='searching' AND (TG_OP='INSERT' OR OLD.status<>'searching') THEN
  PERFORM public.lfg_alert_emit(NEW.id,'opening',key||':opening','New '||CASE WHEN NEW.is_league THEN 'League ' ELSE '' END||'lobby','A '||COALESCE(NEW.mode,'async')||' lobby is looking for players.');
  PERFORM public.lfg_alert_emit(NEW.id,'own_open',key||':own','Your lobby is open','You have a seat in lobby #'||NEW.id||'.');
 END IF;
 IF n>=4 AND old_n<4 AND NEW.status IN ('searching','started') THEN PERFORM public.lfg_alert_emit(NEW.id,'full',key||':full','Your lobby is full (4/4)','Ready to start lobby #'||NEW.id||'.'); END IF;
 IF TG_OP='UPDATE' AND NEW.linked_game_id IS NOT NULL AND NEW.linked_game_id IS DISTINCT FROM OLD.linked_game_id THEN PERFORM public.lfg_alert_emit(NEW.id,'result',key||':result','Lobby result reported','A match result was linked to your lobby.'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lfg_alert_lobby_changed AFTER INSERT OR UPDATE ON public.active_async_matches FOR EACH ROW EXECUTE FUNCTION public.lfg_alert_lobby_changed();

CREATE FUNCTION public.lfg_league_start_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE roster text[]; v public.lfg_three_player_votes;
BEGIN
 IF NEW.is_league AND NEW.status='started' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'started') THEN
  roster=public.lfg_roster_tokens(NEW);
  IF cardinality(roster)<4 THEN
   SELECT * INTO v FROM public.lfg_three_player_votes WHERE lobby_id=NEW.id;
   IF cardinality(roster)<>3 OR v.lobby_id IS NULL OR v.roster<>roster OR cardinality(v.approvals)<>3 THEN RAISE EXCEPTION 'League starts require four players or a unanimous three-player vote'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lfg_league_start_guard BEFORE INSERT OR UPDATE ON public.active_async_matches FOR EACH ROW EXECUTE FUNCTION public.lfg_league_start_guard();

CREATE FUNCTION public.lfg_alert_chat_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM public.lfg_alert_emit(NEW.lobby_id,'chat',NEW.id::text||':chat','New lobby chat',NEW.sender_name||': '||CASE NEW.message_code WHEN 'start_3p_ask' THEN 'Start with three players?' WHEN 'agree_3p' THEN 'Agreed to start with three' ELSE NEW.message_code END);
 RETURN NEW; END $$;
CREATE TRIGGER lfg_alert_chat_changed AFTER INSERT ON public.lobby_quick_chats FOR EACH ROW EXECUTE FUNCTION public.lfg_alert_chat_changed();

CREATE FUNCTION public.lfg_alert_browser_action(p_id uuid,p_action text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.lfg_alert_deliveries; r public.active_async_matches;
BEGIN
 SELECT * INTO d FROM public.lfg_alert_deliveries WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.active_async_matches WHERE id=d.lobby_id;
 IF r.is_league AND NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin')) THEN RETURN false; END IF;
 IF p_action='claim' AND d.state='pending' AND d.expires_at>now() AND EXISTS(SELECT 1 FROM public.lfg_alert_preferences WHERE user_id=auth.uid() AND browser_enabled) THEN
  UPDATE public.lfg_alert_deliveries SET state='browser_pending',updated_at=now() WHERE id=p_id; RETURN true;
 ELSIF p_action='received' AND d.state IN ('browser_pending','browser_received') THEN
  UPDATE public.lfg_alert_deliveries SET state='browser_received',browser_received_at=COALESCE(browser_received_at,now()),updated_at=now() WHERE id=p_id; RETURN true;
 ELSIF p_action='failed' AND d.state='browser_pending' AND d.browser_received_at IS NULL THEN
  UPDATE public.lfg_alert_deliveries SET state='pending',updated_at=now() WHERE id=p_id; RETURN true;
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.lfg_alert_browser_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lfg_alert_browser_action(uuid,text) TO authenticated;

CREATE FUNCTION public.lfg_claim_alert_email(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.lfg_alert_deliveries; p public.lfg_alert_preferences; r public.active_async_matches; addr text; oid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(8124080);
 SELECT * INTO d FROM public.lfg_alert_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.state<>'pending' OR d.browser_received_at IS NOT NULL OR d.email_due_at>now() OR d.expires_at<=now() THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.lfg_alert_preferences WHERE user_id=d.user_id;
 SELECT * INTO r FROM public.active_async_matches WHERE id=d.lobby_id;
 IF p.email_until IS NULL OR p.email_until<=now() OR NOT d.kind=ANY(p.event_kinds) OR (r.is_league AND NOT(public.has_role(d.user_id,'admin') OR public.has_role(d.user_id,'lfg_admin'))) THEN RETURN NULL; END IF;
 IF d.kind='opening' AND EXISTS(SELECT 1 FROM public.active_async_matches a WHERE a.status IN ('pending_creation','posting','searching','started') AND public.lfg_is_member(a,d.user_id)) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.lfg_alert_deliveries WHERE user_id=d.user_id AND state IN ('email_sending','email_sent') AND updated_at>now()-interval '30 minutes') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.email_outbox WHERE (status='sent' AND sent_at>now()-interval '24 hours') OR status='sending')>=80 THEN RETURN NULL; END IF;
 SELECT email INTO addr FROM auth.users WHERE id=d.user_id;
 IF addr IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.email_outbox(campaign,user_id,to_email,subject,html,text_body,status) VALUES('lfg_alert:'||d.id,d.user_id,addr,d.title,'',d.body,'pending') RETURNING id INTO oid;
 UPDATE public.email_outbox SET status='sending' WHERE id=oid;
 UPDATE public.lfg_alert_deliveries SET state='email_sending',updated_at=now() WHERE id=p_id;
 RETURN jsonb_build_object('outbox_id',oid,'email',addr,'title',d.title,'body',d.body,'lobby_id',d.lobby_id);
END $$;
REVOKE ALL ON FUNCTION public.lfg_claim_alert_email(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_claim_alert_email(uuid) TO service_role;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_alert_deliveries;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_three_player_votes;
 END IF;
END $$;