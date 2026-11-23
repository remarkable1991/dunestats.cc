CREATE OR REPLACE FUNCTION public.get_recruitment_leaderboard_window(p_start timestamptz, p_end timestamptz)
 RETURNS TABLE(prize_rank bigint, player_key text, user_id text, total_points numeric, image_upload_count bigint, referral_signup_count bigint, referral_jackpot_count bigint, total_qualifying_events bigint)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH raw_points AS (
  SELECT sp.player_key, sp.user_id, sp.action_type,
    CASE sp.action_type WHEN 'image_upload' THEN 1 WHEN 'referral_signup' THEN 2 WHEN 'referral_jackpot' THEN 10 ELSE 0 END AS points
  FROM public.sp_events sp
  WHERE sp.action_type IN ('image_upload','referral_signup','referral_jackpot')
    AND sp.created_at >= p_start AND sp.created_at < p_end
),
player_totals AS (
  SELECT rp.player_key, MAX(rp.user_id::text) AS user_id, SUM(rp.points) AS total_points,
    COUNT(*) FILTER (WHERE rp.action_type='image_upload') AS image_upload_count,
    COUNT(*) FILTER (WHERE rp.action_type='referral_signup') AS referral_signup_count,
    COUNT(*) FILTER (WHERE rp.action_type='referral_jackpot') AS referral_jackpot_count,
    COUNT(*) AS total_qualifying_events
  FROM raw_points rp GROUP BY rp.player_key
),
ranked_eligible AS (
  SELECT pt.player_key, DENSE_RANK() OVER (ORDER BY pt.total_points DESC, pt.total_qualifying_events DESC) AS calc_rank
  FROM player_totals pt WHERE LOWER(pt.player_key) <> 'remarkable'
)
SELECT r.calc_rank, pt.player_key, pt.user_id, pt.total_points, pt.image_upload_count, pt.referral_signup_count, pt.referral_jackpot_count, pt.total_qualifying_events
FROM player_totals pt LEFT JOIN ranked_eligible r ON LOWER(pt.player_key)=LOWER(r.player_key)
ORDER BY pt.total_points DESC, pt.total_qualifying_events DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_recruitment_leaderboard_window(timestamptz, timestamptz) TO anon, authenticated, service_role;