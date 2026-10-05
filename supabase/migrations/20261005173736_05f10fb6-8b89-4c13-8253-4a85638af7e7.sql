CREATE POLICY "staff registration select" ON public.tournament_registrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host'));
CREATE POLICY "staff registration insert" ON public.tournament_registrations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host'));
CREATE POLICY "staff registration update" ON public.tournament_registrations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host'));
CREATE POLICY "staff registration delete" ON public.tournament_registrations FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_registrations TO authenticated;

CREATE OR REPLACE FUNCTION public.register_tournament_guest(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_num int := (p->>'tournament_num')::int; v_name text := btrim(p->>'direwolf_name');
BEGIN
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'In-game name required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE tournament_num = v_num AND registration_open) THEN
    RAISE EXCEPTION 'Registration is closed';
  END IF;
  SELECT id INTO v_id FROM tournament_registrations
    WHERE tournament_num = v_num AND user_id IS NULL AND lower(direwolf_name) = lower(v_name) LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO tournament_registrations (tournament_num, direwolf_name, email, discord_username, owns_expansions, active_on_discord, consents, availability, timezone)
    VALUES (v_num, v_name, NULLIF(p->>'email',''), COALESCE(p->>'discord_username',''), COALESCE((p->>'owns_expansions')::boolean,false),
            COALESCE((p->>'active_on_discord')::boolean,false), COALESCE(p->'consents','{}'::jsonb), COALESCE(p->'availability','[]'::jsonb), p->>'timezone')
    RETURNING id INTO v_id;
  ELSE
    UPDATE tournament_registrations SET email = NULLIF(p->>'email',''), discord_username = COALESCE(p->>'discord_username',''),
      owns_expansions = COALESCE((p->>'owns_expansions')::boolean,false), active_on_discord = COALESCE((p->>'active_on_discord')::boolean,false),
      consents = COALESCE(p->'consents','{}'::jsonb), availability = COALESCE(p->'availability','[]'::jsonb), timezone = p->>'timezone', updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.register_tournament_guest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tournament_guest(jsonb) TO anon, authenticated;