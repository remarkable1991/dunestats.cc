DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.mm_join_queue(text,integer)'::regprocedure) INTO d;
  d := replace(d, $r$IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'lfg_admin')) THEN RAISE EXCEPTION 'Pilot is limited to LFG admins'; END IF;$r$, '');
  EXECUTE d;
END $$;