DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE oid='public.admin_consolidate_player_records(uuid,uuid,boolean)'::regprocedure;
 definition:=replace(definition,'p_confirm_same_person boolean)','p_confirm_same_person boolean, p_actor uuid)');
 definition:=replace(definition,'IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),''admin'') THEN','IF auth.role() IS DISTINCT FROM ''service_role'' OR p_actor IS NULL OR NOT public.has_role(p_actor,''admin'') THEN');
 EXECUTE definition;
END $$;
DROP FUNCTION public.admin_consolidate_player_records(uuid,uuid,boolean);
REVOKE ALL ON FUNCTION public.admin_consolidate_player_records(uuid,uuid,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_consolidate_player_records(uuid,uuid,boolean,uuid) TO service_role;