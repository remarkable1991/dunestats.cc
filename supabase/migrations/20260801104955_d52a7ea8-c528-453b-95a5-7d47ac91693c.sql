
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dismissed_notifications TO authenticated;
GRANT ALL ON public.user_dismissed_notifications TO service_role;
ALTER TABLE public.user_dismissed_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own dismissals" ON public.user_dismissed_notifications;
CREATE POLICY "Users manage own dismissals" ON public.user_dismissed_notifications
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_user_notifications(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_last_login TIMESTAMPTZ;
    v_player_key TEXT;
    v_lifetime_sp INTEGER := 0;
    v_small_events JSONB;
    v_medium_matches JSONB;
    v_medium_referrals JSONB;
    v_major_tournaments JSONB;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Unauthorized.';
    END IF;

    SELECT last_sign_in_at, LOWER(BTRIM(username))
    INTO v_last_login, v_player_key
    FROM public.profiles
    WHERE id = p_user_id;

    SELECT LOWER(BTRIM(player_key)) INTO v_player_key
    FROM public.player_ratings
    WHERE claimed_by = p_user_id
    LIMIT 1;

    IF v_player_key IS NULL THEN
      SELECT LOWER(BTRIM(username)) INTO v_player_key FROM public.profiles WHERE id = p_user_id;
    END IF;

    v_last_login := GREATEST(COALESCE(v_last_login, NOW() - INTERVAL '7 days'), NOW() - INTERVAL '7 days');

    SELECT COALESCE(MAX(lifetime_sp), 0) INTO v_lifetime_sp
    FROM public.player_sp WHERE claimed_by = p_user_id OR player_key = v_player_key;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('action_type', action_type, 'count', event_count)), '[]'::jsonb)
    INTO v_small_events
    FROM (
        SELECT action_type, COUNT(*) AS event_count
        FROM public.sp_events
        WHERE (user_id = p_user_id OR player_key = v_player_key)
          AND created_at > v_last_login
          AND action_type NOT IN ('referral_signup', 'referral_jackpot')
        GROUP BY action_type
    ) sub;

    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb)
    INTO v_medium_matches
    FROM (
      SELECT jsonb_build_object(
            'game_id', g.id,
            'public_match_id', g.public_match_id,
            'placement', gr.placement,
            'points', gr.points,
            'leader_name', gr.leader_name,
            'elo_delta', gr.elo_delta,
            'elo_delta_overall', gr.elo_delta_overall,
            'created_at', g.created_at
        ) AS x
      FROM public.game_results gr
      JOIN public.games g ON g.id = gr.game_id
      WHERE LOWER(BTRIM(gr.player_name)) = v_player_key
        AND g.created_at > v_last_login
        AND NOT EXISTS (
            SELECT 1 FROM public.user_dismissed_notifications d
            WHERE d.user_id = p_user_id AND d.notification_type = 'match_result' AND d.reference_id = g.id::text
        )
    ) m;

    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb)
    INTO v_medium_referrals
    FROM (
      SELECT jsonb_build_object(
            'event_id', id,
            'action_type', action_type,
            'amount', amount,
            'metadata', metadata,
            'created_at', created_at
        ) AS x
      FROM public.sp_events
      WHERE (user_id = p_user_id OR player_key = v_player_key)
        AND created_at > v_last_login
        AND action_type IN ('referral_signup', 'referral_jackpot')
        AND NOT EXISTS (
            SELECT 1 FROM public.user_dismissed_notifications d
            WHERE d.user_id = p_user_id AND d.notification_type = 'referral' AND d.reference_id = sp_events.id::text
        )
    ) r;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'tournament_num', t.tournament_num,
            'name', t.name,
            'info_title', t.info_title,
            'info_text', t.info_text,
            'start_date', t.start_date,
            'end_date', t.end_date,
            'registration_url', CONCAT('/tournaments/', t.tournament_num),
            'updated_at', t.updated_at
        )), '[]'::jsonb)
    INTO v_major_tournaments
    FROM public.tournaments t
    WHERE t.registration_open = true
      AND GREATEST(t.updated_at, t.created_at) > v_last_login
      AND NOT EXISTS (
          SELECT 1 FROM public.user_dismissed_notifications d
          WHERE d.user_id = p_user_id AND d.notification_type = 'tournament_modal' AND d.reference_id = t.tournament_num::text
      );

    RETURN jsonb_build_object(
        'last_sign_in_at', v_last_login,
        'player_key', v_player_key,
        'lifetime_sp', v_lifetime_sp,
        'small_events', v_small_events,
        'medium_matches', v_medium_matches,
        'medium_referrals', v_medium_referrals,
        'major_tournaments', v_major_tournaments
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_user_notification(p_notification_type text, p_reference_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  INSERT INTO public.user_dismissed_notifications (user_id, notification_type, reference_id, dismissed_at)
  VALUES (v_user, p_notification_type, p_reference_id, NOW());
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_last_sign_in()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  UPDATE public.profiles SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = v_user;
  RETURN jsonb_build_object('ok', true);
END;
$function$;
