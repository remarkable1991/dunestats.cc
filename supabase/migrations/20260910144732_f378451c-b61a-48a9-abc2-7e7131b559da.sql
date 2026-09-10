CREATE TABLE public.match_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_name text,
  source text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_label text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX match_audit_log_game_idx ON public.match_audit_log(game_id, created_at DESC);

GRANT SELECT ON public.match_audit_log TO anon;
GRANT SELECT ON public.match_audit_log TO authenticated;
GRANT ALL ON public.match_audit_log TO service_role;

ALTER TABLE public.match_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match history is publicly readable"
ON public.match_audit_log FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public.match_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT pr.display_name FROM public.player_ratings pr
      WHERE pr.claimed_by = _uid AND pr.display_name IS NOT NULL
      ORDER BY pr.games_played DESC LIMIT 1),
    (SELECT p.username FROM public.profiles p WHERE p.id = _uid),
    (SELECT p.discord_username FROM public.profiles p WHERE p.id = _uid)
  )
$$;

CREATE OR REPLACE FUNCTION public.log_match_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_game_id uuid;
  v_entity text;
  v_label text;
  v_action text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  k text;
  v_source text;
  v_skip text[] := ARRAY['id','created_at','updated_at','game_id'];
BEGIN
  IF TG_TABLE_NAME = 'games' THEN
    v_entity := 'game';
    v_game_id := COALESCE(NEW.id, OLD.id);
    v_label := NULL;
  ELSE
    v_entity := 'player';
    v_game_id := COALESCE(NEW.game_id, OLD.game_id);
    v_label := COALESCE(NEW.player_name, OLD.player_name);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN v_entity = 'game' THEN 'created' ELSE 'player_added' END;
    IF v_entity = 'game' THEN
      v_changes := jsonb_build_object('source', to_jsonb(NEW.source));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'player_removed';
  ELSE
    v_action := 'updated';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k = ANY(v_skip) THEN CONTINUE; END IF;
      IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  IF v_uid IS NULL THEN
    v_source := 'system';
  ELSIF TG_OP = 'INSERT' THEN
    v_source := 'upload';
  ELSE
    v_source := 'manual';
  END IF;

  INSERT INTO public.match_audit_log (game_id, actor_user_id, actor_name, source, action, entity, entity_label, changes)
  VALUES (v_game_id, v_uid, public.match_actor_name(v_uid), v_source, v_action, v_entity, v_label, v_changes);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_games_change
AFTER INSERT OR UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.log_match_change();

CREATE TRIGGER trg_log_game_results_change
AFTER INSERT OR UPDATE OR DELETE ON public.game_results
FOR EACH ROW EXECUTE FUNCTION public.log_match_change();