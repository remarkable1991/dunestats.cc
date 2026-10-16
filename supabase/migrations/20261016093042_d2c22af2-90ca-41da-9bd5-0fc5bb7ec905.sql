CREATE TABLE public.player_name_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_name text NOT NULL,
  canonical_name text NOT NULL,
  tournament_num integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX player_name_aliases_uq ON public.player_name_aliases (lower(old_name), lower(canonical_name));
GRANT SELECT ON public.player_name_aliases TO anon, authenticated;
GRANT ALL ON public.player_name_aliases TO service_role;
ALTER TABLE public.player_name_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read name corrections" ON public.player_name_aliases FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.admin_rename_tournament_player(
  p_tournament_num integer, p_old_name text, p_new_name text,
  p_update_registration boolean DEFAULT true, p_update_account boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text := btrim(p_old_name); v_new text := btrim(p_new_name);
  v_matches int := 0; v_regs int := 0; v_profiles int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tournament_host')
          OR public.has_role(auth.uid(),'tournament_moderator')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_old = '' OR v_new = '' OR lower(v_old) = lower(v_new) THEN
    RETURN jsonb_build_object('matches',0,'registrations',0,'profiles',0);
  END IF;
  UPDATE tournament_matches SET player_name = v_new, updated_at = now()
   WHERE tournament_num = p_tournament_num AND lower(btrim(player_name)) = lower(v_old);
  GET DIAGNOSTICS v_matches = ROW_COUNT;
  IF p_update_registration THEN
    UPDATE tournament_registrations SET direwolf_name = v_new, updated_at = now()
     WHERE tournament_num = p_tournament_num AND lower(btrim(direwolf_name)) = lower(v_old);
    GET DIAGNOSTICS v_regs = ROW_COUNT;
  END IF;
  IF p_update_account THEN
    UPDATE profiles p SET username = v_new, updated_at = now()
     WHERE lower(btrim(p.username)) = lower(v_old)
       AND p.id IN (SELECT user_id FROM tournament_registrations
                    WHERE tournament_num = p_tournament_num AND user_id IS NOT NULL
                      AND lower(btrim(direwolf_name)) IN (lower(v_old), lower(v_new)));
    GET DIAGNOSTICS v_profiles = ROW_COUNT;
  END IF;
  INSERT INTO player_name_aliases (old_name, canonical_name, tournament_num, created_by)
  VALUES (v_old, v_new, p_tournament_num, auth.uid())
  ON CONFLICT (lower(old_name), lower(canonical_name)) DO NOTHING;
  RETURN jsonb_build_object('matches',v_matches,'registrations',v_regs,'profiles',v_profiles);
END $$;
REVOKE ALL ON FUNCTION public.admin_rename_tournament_player(integer,text,text,boolean,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_rename_tournament_player(integer,text,text,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.tournament_roster_registration_availability(p_tournament_num integer, p_player_names text[])
RETURNS TABLE(player_name text, availability jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH names AS (SELECT DISTINCT btrim(n) AS name FROM unnest(coalesce(p_player_names,'{}'::text[])) n WHERE btrim(n) <> ''),
  cand AS (
    SELECT n.name, r.availability, r.updated_at,
      CASE WHEN lower(btrim(r.direwolf_name)) = lower(n.name) THEN 0
           WHEN EXISTS (SELECT 1 FROM player_name_aliases a WHERE lower(a.canonical_name)=lower(n.name) AND lower(a.old_name)=lower(btrim(r.direwolf_name))) THEN 1
           ELSE 2 END AS prio
    FROM names n JOIN tournament_registrations r ON r.tournament_num = p_tournament_num
    WHERE lower(btrim(r.direwolf_name)) = lower(n.name)
       OR EXISTS (SELECT 1 FROM player_name_aliases a WHERE lower(a.canonical_name)=lower(n.name) AND lower(a.old_name)=lower(btrim(r.direwolf_name)))
       OR (coalesce(r.discord_username,'') <> '' AND EXISTS (
            SELECT 1 FROM tournament_matches tm WHERE tm.tournament_num = p_tournament_num
              AND lower(btrim(tm.player_name)) = lower(n.name) AND coalesce(tm.discord_username,'') <> ''
              AND regexp_replace(lower(tm.discord_username),'[\s._]','','g') = regexp_replace(lower(r.discord_username),'[\s._]','','g')))
  )
  SELECT DISTINCT ON (lower(name)) name, availability FROM cand
  WHERE jsonb_typeof(availability)='array' AND jsonb_array_length(availability) > 0
  ORDER BY lower(name), prio, updated_at DESC
$function$;

UPDATE public.tournament_registrations SET direwolf_name='duncracer', updated_at=now() WHERE id='3b99ca23-d48d-4e1c-8771-32d12734a5d1';
UPDATE public.tournament_registrations SET direwolf_name='Arkachacal', updated_at=now() WHERE id='89f9d787-e55c-4e42-a6c2-9ee974f5ede7';
INSERT INTO public.player_name_aliases (old_name, canonical_name, tournament_num) VALUES
 ('Duncraacer','duncracer',18),('theo-viennot','Arkachacal',18),('duncanbcward','duncracer',18)
ON CONFLICT DO NOTHING;