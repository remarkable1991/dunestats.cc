CREATE FUNCTION public.claim_email_outbox_batch(p_limit integer DEFAULT 50) RETURNS SETOF public.email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE budget integer;
BEGIN
 PERFORM pg_advisory_xact_lock(8124080);
 SELECT greatest(0,80-count(*)::integer) INTO budget FROM public.email_outbox WHERE (status='sent' AND sent_at>now()-interval '24 hours') OR status='sending';
 RETURN QUERY WITH picked AS (SELECT id FROM public.email_outbox WHERE status='pending' AND campaign NOT LIKE 'lfg_alert:%' ORDER BY created_at LIMIT least(greatest(p_limit,0),50,budget) FOR UPDATE SKIP LOCKED)
 UPDATE public.email_outbox o SET status='sending' FROM picked WHERE o.id=picked.id RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(integer) TO service_role;