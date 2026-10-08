CREATE TABLE public.lfg_lobby_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id bigint NOT NULL REFERENCES public.active_async_matches(id) ON DELETE CASCADE,
  actor_name text,
  kind text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lfg_lobby_events_lobby_idx ON public.lfg_lobby_events(lobby_id, created_at);
GRANT SELECT ON public.lfg_lobby_events TO anon, authenticated;
GRANT ALL ON public.lfg_lobby_events TO service_role;
ALTER TABLE public.lfg_lobby_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events visible with their lobby" ON public.lfg_lobby_events FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.active_async_matches a WHERE a.id = lobby_id));

CREATE OR REPLACE FUNCTION public.lfg_log_lobby_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_actor text := CASE WHEN auth.uid() IS NULL THEN 'Discord' ELSE public.match_actor_name(auth.uid()) END;
  x text;
  nm text;
BEGIN
  FOREACH x IN ARRAY COALESCE(NEW.web_player_names, '{}') LOOP
    IF NOT (x = ANY(COALESCE(OLD.web_player_names, '{}'))) THEN
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'join', x || ' joined (website)');
    END IF;
  END LOOP;
  FOREACH x IN ARRAY COALESCE(OLD.web_player_names, '{}') LOOP
    IF NOT (x = ANY(COALESCE(NEW.web_player_names, '{}'))) THEN
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'leave', x || ' left (website)');
    END IF;
  END LOOP;
  FOREACH x IN ARRAY COALESCE(NEW.player_ids, '{}') LOOP
    IF NOT (x = ANY(COALESCE(OLD.player_ids, '{}'))) THEN
      SELECT COALESCE(NULLIF(btrim(display_name),''), player_key, discord_username) INTO nm FROM player_discord_map WHERE discord_user_id = x LIMIT 1;
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'join', COALESCE(nm, 'Discord player') || ' joined (Discord)');
    END IF;
  END LOOP;
  FOREACH x IN ARRAY COALESCE(OLD.player_ids, '{}') LOOP
    IF NOT (x = ANY(COALESCE(NEW.player_ids, '{}'))) THEN
      SELECT COALESCE(NULLIF(btrim(display_name),''), player_key, discord_username) INTO nm FROM player_discord_map WHERE discord_user_id = x LIMIT 1;
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'leave', COALESCE(nm, 'Discord player') || ' left (Discord)');
    END IF;
  END LOOP;
  FOREACH x IN ARRAY COALESCE(NEW.guest_players, '{}') LOOP
    IF NOT (x = ANY(COALESCE(OLD.guest_players, '{}'))) THEN
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'join', x || ' added as guest');
    END IF;
  END LOOP;
  FOREACH x IN ARRAY COALESCE(OLD.guest_players, '{}') LOOP
    IF NOT (x = ANY(COALESCE(NEW.guest_players, '{}'))) THEN
      INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'leave', x || ' removed (guest)');
    END IF;
  END LOOP;
  IF NEW.lobby_password IS DISTINCT FROM OLD.lobby_password THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', CASE WHEN NEW.lobby_password IS NULL THEN 'Password removed' ELSE 'Password updated' END);
  END IF;
  IF NEW.mode IS DISTINCT FROM OLD.mode THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', 'Mode changed to ' || COALESCE(upper(NEW.mode), '—'));
  END IF;
  IF NEW.board_type IS DISTINCT FROM OLD.board_type THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', 'Board changed to ' || COALESCE(NEW.board_type, '—'));
  END IF;
  IF NEW.expansions IS DISTINCT FROM OLD.expansions THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', 'Expansions changed to ' || COALESCE(NULLIF(array_to_string(NEW.expansions, ', '), ''), 'none'));
  END IF;
  IF NEW.message_text IS DISTINCT FROM OLD.message_text THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', 'Notes updated');
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND OLD.expires_at IS NOT NULL THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'setting', 'Expiry time changed');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail) VALUES (NEW.id, v_actor, 'status', 'Status changed to ' || NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lfg_log_lobby_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lfg_log_lobby_changes AFTER UPDATE ON public.active_async_matches
FOR EACH ROW EXECUTE FUNCTION public.lfg_log_lobby_changes();

ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_lobby_events;