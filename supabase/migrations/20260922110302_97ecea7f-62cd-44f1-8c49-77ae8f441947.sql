CREATE OR REPLACE FUNCTION public.lfg_create_lobby(
  p_mode text,
  p_board text,
  p_expansions text[],
  p_notes text,
  p_password text,
  p_expires_minutes integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.lfg_create_lobby(
    p_mode,
    p_board,
    p_expansions,
    p_notes,
    p_password,
    p_expires_minutes,
    '{}'::text[]
  );
$function$;

REVOKE ALL ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer) TO service_role;