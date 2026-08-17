CREATE TABLE public.tournament_pending_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  tournament_num integer NOT NULL,
  round_type text,
  table_identifier text,
  submitted_by uuid,
  status text NOT NULL DEFAULT 'pending',
  detected_players jsonb NOT NULL DEFAULT '[]'::jsonb,
  unmatched jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_pending_matches TO authenticated;
GRANT ALL ON public.tournament_pending_matches TO service_role;
ALTER TABLE public.tournament_pending_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin can view pending matches"
  ON public.tournament_pending_matches FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users can submit pending matches"
  ON public.tournament_pending_matches FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "admins can update pending matches"
  ON public.tournament_pending_matches FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete pending matches"
  ON public.tournament_pending_matches FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_pending_matches_status ON public.tournament_pending_matches (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.approve_pending_tournament_match(
  p_id uuid,
  p_round text DEFAULT NULL,
  p_table text DEFAULT NULL,
  p_name_fixes jsonb DEFAULT '{}'::jsonb,
  p_match_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tournament_pending_matches%ROWTYPE;
  v_game_id uuid;
  v_round text;
  v_table text;
  v_img text;
  k text;
  v text;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT * INTO v_row FROM public.tournament_pending_matches WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending match not found'; END IF;

  v_round := COALESCE(NULLIF(btrim(p_round), ''), v_row.round_type);
  v_table := COALESCE(NULLIF(btrim(p_table), ''), v_row.table_identifier);
  IF v_round IS NULL OR v_table IS NULL THEN
    RAISE EXCEPTION 'Round and table are required';
  END IF;

  IF NULLIF(btrim(p_match_code), '') IS NOT NULL THEN
    SELECT id INTO v_game_id FROM public.games
      WHERE upper(public_match_id) = upper(btrim(p_match_code));
    IF v_game_id IS NULL THEN RAISE EXCEPTION 'No match found with that Match ID'; END IF;
  ELSE
    v_game_id := v_row.game_id;
  END IF;
  IF v_game_id IS NULL THEN RAISE EXCEPTION 'No game linked to this submission'; END IF;

  -- 1. Apply admin name corrections on the tournament roster
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_name_fixes, '{}'::jsonb)) LOOP
    IF NULLIF(btrim(v), '') IS NULL THEN CONTINUE; END IF;
    UPDATE public.tournament_matches
      SET player_name = btrim(v), updated_at = now()
      WHERE tournament_num = v_row.tournament_num
        AND lower(player_name) = lower(btrim(k));
  END LOOP;

  -- 2. Tag the game as part of this tournament
  UPDATE public.games SET tournament_num = v_row.tournament_num WHERE id = v_game_id;

  -- 3. Copy the screenshot onto the table
  SELECT image_url INTO v_img FROM public.games WHERE id = v_game_id;
  IF v_img IS NOT NULL THEN
    INSERT INTO public.tournament_table_screenshots
      (tournament_num, round_type, table_identifier, image_url, created_by)
    VALUES (v_row.tournament_num, v_round, v_table, v_img, auth.uid())
    ON CONFLICT (tournament_num, round_type, table_identifier)
    DO UPDATE SET image_url = EXCLUDED.image_url, created_by = EXCLUDED.created_by;
  END IF;

  -- 4. Apply the results to the table slots
  FOR r IN SELECT placement, player_name, leader_name, points
           FROM public.game_results WHERE game_id = v_game_id LOOP
    UPDATE public.tournament_matches tm
      SET placement = r.placement,
          points = r.points,
          leader_name = r.leader_name,
          updated_at = now()
      WHERE tm.tournament_num = v_row.tournament_num
        AND tm.round_type = v_round
        AND tm.table_identifier = v_table
        AND lower(tm.player_name) = lower(r.player_name);
  END LOOP;

  UPDATE public.tournament_pending_matches
    SET status = 'approved', round_type = v_round, table_identifier = v_table,
        game_id = v_game_id, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'game_id', v_game_id,
    'round_type', v_round, 'table_identifier', v_table);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pending_tournament_match(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  UPDATE public.tournament_pending_matches
    SET status = 'rejected', note = COALESCE(p_note, note),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;