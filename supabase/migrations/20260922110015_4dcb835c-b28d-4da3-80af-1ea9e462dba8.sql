REVOKE ALL ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer, text[]) TO service_role;