CREATE OR REPLACE FUNCTION public.lfg_leave_seat(p_id bigint, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 r public.active_async_matches%ROWTYPE;
 dids text[];
 widx integer[];
 didx integer[];
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 SELECT * INTO r FROM public.active_async_matches WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby not found'; END IF;
 IF coalesce(r.is_league,false) AND NOT (public.has_role(p_actor,'admin') OR public.has_role(p_actor,'lfg_admin')) THEN RAISE EXCEPTION 'Lobby not found or access denied'; END IF;
 IF r.status NOT IN ('pending_creation','posting','searching') THEN RAISE EXCEPTION 'This lobby is no longer open'; END IF;
 SELECT coalesce(array_agg(discord_user_id), '{}'::text[]) INTO dids FROM public.player_discord_map WHERE claimed_by=p_actor AND discord_user_id IS NOT NULL;
 IF r.web_host_id=p_actor OR r.host_id=ANY(dids) THEN RAISE EXCEPTION 'Hosts must cancel the lobby instead of leaving'; END IF;
 SELECT coalesce(array_agg(i::integer),'{}'::integer[]) INTO widx FROM unnest(coalesce(r.web_player_ids,'{}'::uuid[])) WITH ORDINALITY AS s(uid,i) WHERE uid=p_actor;
 SELECT coalesce(array_agg(i::integer),'{}'::integer[]) INTO didx FROM unnest(coalesce(r.player_ids,'{}'::text[])) WITH ORDINALITY AS s(did,i) WHERE did=ANY(dids);
 IF cardinality(widx)=0 AND cardinality(didx)=0 THEN RAISE EXCEPTION 'You do not have a verified seat in this lobby'; END IF;
 IF cardinality(widx)>0 AND cardinality(r.web_player_ids) IS DISTINCT FROM cardinality(r.web_player_names) THEN RAISE EXCEPTION 'The website roster needs an administrator correction before you can leave'; END IF;
 UPDATE public.active_async_matches SET
 web_player_ids=CASE WHEN cardinality(widx)>0 THEN ARRAY(SELECT v FROM unnest(r.web_player_ids) WITH ORDINALITY AS s(v,i) WHERE NOT i::integer=ANY(widx) ORDER BY i) ELSE r.web_player_ids END,
 web_player_names=CASE WHEN cardinality(widx)>0 THEN ARRAY(SELECT v FROM unnest(r.web_player_names) WITH ORDINALITY AS s(v,i) WHERE NOT i::integer=ANY(widx) ORDER BY i) ELSE r.web_player_names END,
 player_ids=CASE WHEN cardinality(didx)>0 THEN ARRAY(SELECT v FROM unnest(r.player_ids) WITH ORDINALITY AS s(v,i) WHERE NOT i::integer=ANY(didx) ORDER BY i) ELSE r.player_ids END,
 discord_usernames=CASE WHEN cardinality(didx)>0 AND cardinality(r.discord_usernames)=cardinality(r.player_ids) THEN ARRAY(SELECT v FROM unnest(r.discord_usernames) WITH ORDINALITY AS s(v,i) WHERE NOT i::integer=ANY(didx) ORDER BY i) ELSE r.discord_usernames END,
 expected_player_keys=CASE WHEN cardinality(didx)>0 AND cardinality(r.expected_player_keys)=cardinality(r.player_ids) THEN ARRAY(SELECT v FROM unnest(r.expected_player_keys) WITH ORDINALITY AS s(v,i) WHERE NOT i::integer=ANY(didx) ORDER BY i) ELSE r.expected_player_keys END,
 auto_start_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('ok',true,'id',p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.lfg_leave_seat(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_leave_seat(bigint,uuid) TO service_role;