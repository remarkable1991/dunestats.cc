ALTER TABLE public.games ADD COLUMN IF NOT EXISTS play_mode text CHECK (play_mode IS NULL OR play_mode IN ('live','async'));

CREATE OR REPLACE FUNCTION public.set_game_play_mode(p_game_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_mode IS NOT NULL AND p_mode NOT IN ('live','async') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  UPDATE public.games SET play_mode = p_mode
  WHERE id = p_game_id
    AND (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'match_moderator'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_game_play_mode(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_game_play_mode(uuid,text) TO authenticated;