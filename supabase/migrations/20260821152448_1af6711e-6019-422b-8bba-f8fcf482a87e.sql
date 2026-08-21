CREATE OR REPLACE FUNCTION public.get_user_notifications(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_last_login TIMESTAMPTZ;
    v_player_key TEXT;
    v_lifetime_sp INTEGER := 0;
    v_small_events JSONB := '[]'::jsonb;
    v_medium_matches JSONB := '[]'::jsonb;
    v_medium_referrals JSONB := '[]'::jsonb;
    v_major_tournaments JSONB := '[]'::jsonb;
    v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '7 days';
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

    SELECT COALESCE(MAX(lifetime_sp), 0) INTO v_lifetime_sp
    FROM public.player_sp
    WHERE claimed_by = p_user_id OR player_key = v_player_key;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('action_type', action_type, 'count', event_count)), '[]'::jsonb)
    INTO v_small_events
    FROM (
        SELECT action_type, COUNT(*) AS event_count
        FROM public.sp_events
        WHERE (user_id = p_user_id OR (v_player_key IS NOT NULL AND player_key = v_player_key))
          AND created_at >= GREATEST(v_cutoff, COALESCE(v_last_login, v_cutoff))
          AND action_type NOT IN ('referral_signup', 'referral_jackpot')
        GROUP BY action_type
    ) sub;

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb)
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
      WHERE (v_player_key IS NOT NULL AND LOWER(BTRIM(gr.player_name)) = v_player_key)
        AND g.created_at >= v_cutoff
        AND NOT EXISTS (
            SELECT 1 FROM public.user_dismissed_notifications d
            WHERE d.user_id = p_user_id
              AND d.notification_type = 'match_result'
              AND d.reference_id = g.id::text
        )
    ) m;

    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb)
    INTO v_medium_referrals
    FROM (
      SELECT jsonb_build_object(
            'event_id', spe.id,
            'action_type', spe.action_type,
            'amount', spe.amount,
            'metadata', spe.metadata,
            'created_at', spe.created_at
        ) AS x
      FROM public.sp_events spe
      WHERE (spe.user_id = p_user_id OR (v_player_key IS NOT NULL AND spe.player_key = v_player_key))
        AND spe.created_at >= v_cutoff
        AND spe.action_type IN ('referral_signup', 'referral_jackpot')
        AND NOT EXISTS (
            SELECT 1 FROM public.user_dismissed_notifications d
            WHERE d.user_id = p_user_id
              AND d.notification_type = 'referral'
              AND d.reference_id = spe.id::text
        )
    ) r;

    WITH tourney_calc AS (
        SELECT
            t.tournament_num,
            t.name,
            t.info_title,
            t.info_text,
            t.start_date,
            t.end_date,
            t.registration_open,
            t.updated_at,
            COALESCE(t.checkin_start_at, (t.start_date::date - INTERVAL '24 hours')) AS c_start,
            (COALESCE(t.checkin_start_at, (t.start_date::date - INTERVAL '24 hours')) + INTERVAL '24 hours') AS c_end
        FROM public.tournaments t
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'tournament_num', tc.tournament_num,
            'name', tc.name,
            'info_title', tc.info_title,
            'info_text', tc.info_text,
            'start_date', tc.start_date,
            'end_date', tc.end_date,
            'is_checkin', (NOW() >= tc.c_start AND NOW() < tc.c_end),
            'notification_type', CASE WHEN (NOW() >= tc.c_start AND NOW() < tc.c_end) THEN 'tournament_checkin' ELSE 'tournament_modal' END,
            'registration_url', CONCAT('/tournaments/', tc.tournament_num),
            'updated_at', tc.updated_at
        )), '[]'::jsonb)
    INTO v_major_tournaments
    FROM tourney_calc tc
    WHERE (
        (tc.registration_open = true AND NOW() < (tc.start_date::date + INTERVAL '24 hours'))
        OR
        (NOW() >= tc.c_start AND NOW() < tc.c_end)
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.user_dismissed_notifications d
          WHERE d.user_id = p_user_id
            AND d.notification_type = (CASE WHEN (NOW() >= tc.c_start AND NOW() < tc.c_end) THEN 'tournament_checkin' ELSE 'tournament_modal' END)
            AND d.reference_id = tc.tournament_num::text
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