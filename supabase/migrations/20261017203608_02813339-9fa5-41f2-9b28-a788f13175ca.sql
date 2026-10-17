ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_creator';

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS youtube_url text;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_league boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_games_youtube ON public.games (created_at DESC) WHERE youtube_url IS NOT NULL;

UPDATE public.games g SET is_league = true
  FROM public.active_async_matches a
 WHERE a.linked_game_id = g.id AND a.is_league;

CREATE OR REPLACE FUNCTION public.set_game_youtube_url(p_game_id uuid, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text := NULLIF(trim(coalesce(p_url,'')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'content_creator'::public.app_role)) THEN
    RAISE EXCEPTION 'Only content creators can add videos';
  END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/' THEN
    RAISE EXCEPTION 'Only YouTube links are allowed';
  END IF;
  UPDATE public.games SET youtube_url = v_url WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_game_youtube_url(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_game_youtube_url(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.lfg_link_game(p_id bigint, p_public_match_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
  v_game uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Not signed in'); END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found'); END IF;
  IF NOT (public.lfg_is_member(v_row, v_uid) OR public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'lfg_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only lobby players or LFG admins can link a result');
  END IF;
  SELECT id INTO v_game FROM public.games
   WHERE upper(public_match_id) = upper(trim(p_public_match_id)) OR id::text = trim(p_public_match_id) LIMIT 1;
  IF v_game IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Match not found'); END IF;
  UPDATE public.active_async_matches
     SET linked_game_id = v_game,
         league_status = CASE WHEN is_league THEN 'reported' ELSE league_status END,
         status = CASE WHEN status = 'searching' THEN 'started' ELSE status END
   WHERE id = p_id;
  IF v_row.is_league THEN UPDATE public.games SET is_league = true WHERE id = v_game; END IF;
  RETURN jsonb_build_object('ok', true, 'game_id', v_game);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lfg_link_game(bigint, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lfg_link_game(bigint, text) TO authenticated;