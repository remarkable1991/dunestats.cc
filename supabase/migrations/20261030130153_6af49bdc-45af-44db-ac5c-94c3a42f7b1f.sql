INSERT INTO public.lfg_three_player_votes(lobby_id,roster,approvals)
VALUES(268,ARRAY['player:discord:338735967152111626','player:remarkable','player:sunmanbg'],ARRAY['player:discord:338735967152111626','player:remarkable','player:sunmanbg'])
ON CONFLICT(lobby_id) DO UPDATE SET roster=EXCLUDED.roster,approvals=EXCLUDED.approvals,updated_at=now();
UPDATE public.active_async_matches SET status='started',auto_start_at=NULL WHERE id=268 AND status='searching' AND cardinality(player_ids)=3;