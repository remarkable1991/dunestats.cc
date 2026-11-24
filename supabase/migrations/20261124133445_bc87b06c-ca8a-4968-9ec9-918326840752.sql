CREATE OR REPLACE FUNCTION public.clear_lobby_link_before_game_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Revert while the lobby link is still available for League consistency checks.
  PERFORM public.revert_league_deltas_for_game(OLD.id);

  UPDATE public.active_async_matches
  SET linked_game_id = NULL,
      status = CASE WHEN is_league THEN 'started' ELSE status END,
      league_status = CASE WHEN is_league THEN NULL ELSE league_status END
  WHERE linked_game_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clear_lobby_link_before_game_delete ON public.games;
CREATE TRIGGER clear_lobby_link_before_game_delete
BEFORE DELETE ON public.games
FOR EACH ROW
EXECUTE FUNCTION public.clear_lobby_link_before_game_delete();

-- Repair links left behind by deletions that happened before this safeguard.
UPDATE public.active_async_matches AS lobby
SET linked_game_id = NULL,
    status = CASE WHEN lobby.is_league THEN 'started' ELSE lobby.status END,
    league_status = CASE WHEN lobby.is_league THEN NULL ELSE lobby.league_status END
WHERE lobby.linked_game_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.games AS game WHERE game.id = lobby.linked_game_id
  );