CREATE OR REPLACE FUNCTION public.lfg_bot_vote_three(p_lobby_id bigint, p_discord_user_id text, p_agree boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.active_async_matches; v public.lfg_three_player_votes; roster text[]; token text; sender text;
BEGIN
 IF p_discord_user_id IS NULL OR trim(p_discord_user_id)='' THEN RETURN jsonb_build_object('ok',false,'error','Missing Discord user'); END IF;
 SELECT * INTO r FROM public.active_async_matches WHERE id=p_lobby_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Lobby not found'); END IF;
 IF NOT (p_discord_user_id = ANY(COALESCE(r.player_ids,'{}'::text[]))) THEN RETURN jsonb_build_object('ok',false,'error','Only seated players can vote'); END IF;
 IF NOT COALESCE(r.is_league,false) OR r.status<>'searching' OR (r.expires_at IS NOT NULL AND r.expires_at<=now()) THEN RETURN jsonb_build_object('ok',false,'error','This lobby is not open for a League vote'); END IF;
 roster=public.lfg_roster_tokens(r);
 IF cardinality(roster)<>3 THEN RETURN jsonb_build_object('ok',false,'error','A three-player vote requires exactly three players'); END IF;
 token='player:'||COALESCE((SELECT m.player_key FROM public.player_discord_map m WHERE m.discord_user_id=p_discord_user_id LIMIT 1),'discord:'||p_discord_user_id);
 IF NOT token = ANY(roster) THEN RETURN jsonb_build_object('ok',false,'error','Your seat could not be verified'); END IF;
 sender=COALESCE((SELECT m.player_key FROM public.player_discord_map m WHERE m.discord_user_id=p_discord_user_id LIMIT 1),(SELECT g.display_name FROM public.discord_guild_members g WHERE g.discord_user_id=p_discord_user_id),'Discord player');
 SELECT * INTO v FROM public.lfg_three_player_votes WHERE lobby_id=p_lobby_id;
 IF NOT FOUND OR v.roster<>roster THEN
  INSERT INTO public.lfg_three_player_votes(lobby_id,roster,approvals) VALUES(p_lobby_id,roster,ARRAY[token])
   ON CONFLICT(lobby_id) DO UPDATE SET roster=EXCLUDED.roster,approvals=EXCLUDED.approvals,requested_at=now(),updated_at=now();
  INSERT INTO public.lobby_quick_chats(lobby_id,sender_name,message_code) VALUES(p_lobby_id,sender,'start_3p_ask');
 ELSIF NOT token = ANY(v.approvals) THEN
  UPDATE public.lfg_three_player_votes SET approvals=array_append(approvals,token),updated_at=now() WHERE lobby_id=p_lobby_id;
  INSERT INTO public.lobby_quick_chats(lobby_id,sender_name,message_code) VALUES(p_lobby_id,sender,'agree_3p');
 END IF;
 SELECT * INTO v FROM public.lfg_three_player_votes WHERE lobby_id=p_lobby_id;
 IF cardinality(v.approvals)=3 THEN UPDATE public.active_async_matches SET status='started',auto_start_at=NULL WHERE id=p_lobby_id; END IF;
 RETURN jsonb_build_object('ok',true,'approvals',cardinality(v.approvals),'started',cardinality(v.approvals)=3);
END $$;
REVOKE ALL ON FUNCTION public.lfg_bot_vote_three(bigint,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_bot_vote_three(bigint,text,boolean) TO service_role;