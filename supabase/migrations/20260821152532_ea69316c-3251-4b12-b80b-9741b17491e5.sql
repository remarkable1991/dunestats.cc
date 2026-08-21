REVOKE ALL ON FUNCTION public.get_user_notifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_notifications(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_notifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_notifications(uuid) TO service_role;