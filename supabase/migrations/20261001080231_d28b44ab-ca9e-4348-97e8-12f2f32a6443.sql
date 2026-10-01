DO $do$
DECLARE d text; c text;
BEGIN
SELECT pg_get_functiondef('public.get_player_achievements_season(text,integer)'::regprocedure) INTO d;
IF position('-- 1. RESTORED CALCS' in d) > 0 THEN RETURN; END IF;
c := $c$-- 1. RESTORED CALCS
    DECLARE
        v_set TEXT; v_list TEXT[]; v_n INT;
        a1 INT; a3 INT; a5 INT; aw1 INT; aw3 INT; s1 INT; s2 INT; s3 INT; sw1 INT; sw2 INT;
        m1 TEXT[]; m3 TEXT[]; m5 TEXT[]; mw1 TEXT[]; mw3 TEXT[]; sm1 TEXT[]; sm2 TEXT[]; sm3 TEXT[]; smw1 TEXT[]; smw2 TEXT[];
    BEGIN
    SELECT count(*), count(*) FILTER (WHERE r.placement = 1),
           count(*) FILTER (WHERE g.board_version = 'base'), count(*) FILTER (WHERE g.has_rise_of_ix),
           count(*) FILTER (WHERE g.has_immortality), count(*) FILTER (WHERE g.has_epic_mode),
           count(*) FILTER (WHERE g.board_version = 'uprising'),
           count(*) FILTER (WHERE r.placement = 1 AND r.points >= 15),
           count(*) FILTER (WHERE g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE r.placement = 1 AND g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE g.board_version = 'base' AND g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE g.has_rise_of_ix AND g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE g.has_immortality AND g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE g.has_epic_mode AND g.created_at >= v_season_start AND g.created_at < v_season_end),
           count(*) FILTER (WHERE g.board_version = 'uprising' AND g.created_at >= v_season_start AND g.created_at < v_season_end)
      INTO v_total_games, v_total_wins, v_base_games, v_ix_games, v_immo_games, v_epic_games, v_upr_games, v_wins_15plus_vp,
           v_s_total_games, v_s_total_wins, v_s_base_games, v_s_ix_games, v_s_immo_games, v_s_epic_games, v_s_upr_games
      FROM public.game_results r JOIN public.games g ON g.id = r.game_id
     WHERE lower(trim(r.player_name)) = v_key;

    FOREACH v_set IN ARRAY ARRAY['base','ix','upr'] LOOP
        v_list := CASE v_set
          WHEN 'base' THEN ARRAY['Paul Atreides','Duke Leto Atreides','Baron Vladimir Harkonnen','Glossu "Beast" Rabban','Helena Richese','Count Ilban Richese','Earl Memnon Thorvald','Countess Ariana Thorvald']
          WHEN 'ix' THEN ARRAY['Archduke Armand Ecaz','Ilesa Ecaz','Viscount Hundro Moritani','"Princess" Yuna Moritani','Prince Rhombur Vernius','Tessia Vernius']
          ELSE ARRAY['Gurney Halleck','Muad''Dib','Feyd-Rautha Harkonnen','Staban Tuek','Lady Margot Fenring','Princess Irulan','Shaddam Corrino IV','Lady Jessica','Lady Amber Metulli'] END;
        SELECT count(*) FILTER (WHERE p>=1), count(*) FILTER (WHERE p>=3), count(*) FILTER (WHERE p>=5),
               count(*) FILTER (WHERE w>=1), count(*) FILTER (WHERE w>=3),
               count(*) FILTER (WHERE sp>=1), count(*) FILTER (WHERE sp>=2), count(*) FILTER (WHERE sp>=3),
               count(*) FILTER (WHERE sw>=1), count(*) FILTER (WHERE sw>=2),
               COALESCE(array_agg(l) FILTER (WHERE p<1),'{}'), COALESCE(array_agg(l) FILTER (WHERE p<3),'{}'), COALESCE(array_agg(l) FILTER (WHERE p<5),'{}'),
               COALESCE(array_agg(l) FILTER (WHERE w<1),'{}'), COALESCE(array_agg(l) FILTER (WHERE w<3),'{}'),
               COALESCE(array_agg(l) FILTER (WHERE sp<1),'{}'), COALESCE(array_agg(l) FILTER (WHERE sp<2),'{}'), COALESCE(array_agg(l) FILTER (WHERE sp<3),'{}'),
               COALESCE(array_agg(l) FILTER (WHERE sw<1),'{}'), COALESCE(array_agg(l) FILTER (WHERE sw<2),'{}')
          INTO a1,a3,a5,aw1,aw3,s1,s2,s3,sw1,sw2,m1,m3,m5,mw1,mw3,sm1,sm2,sm3,smw1,smw2
          FROM (
            SELECT x.l,
                   count(r.game_id) p,
                   count(r.game_id) FILTER (WHERE r.placement = 1) w,
                   count(r.game_id) FILTER (WHERE g.created_at >= v_season_start AND g.created_at < v_season_end) sp,
                   count(r.game_id) FILTER (WHERE r.placement = 1 AND g.created_at >= v_season_start AND g.created_at < v_season_end) sw
              FROM unnest(v_list) AS x(l)
              LEFT JOIN public.game_results r ON r.leader_name = x.l AND lower(trim(r.player_name)) = v_key
              LEFT JOIN public.games g ON g.id = r.game_id
             GROUP BY x.l) t;
        IF v_set = 'base' THEN
            v_base_p1:=a1; v_base_p3:=a3; v_base_p5:=a5; v_base_w1:=aw1; v_base_w3:=aw3;
            v_base_missing_p1:=m1; v_base_missing_p3:=m3; v_base_missing_p5:=m5; v_base_missing_w1:=mw1; v_base_missing_w3:=mw3;
            v_s_base_p1:=s1; v_s_base_p2:=s2; v_s_base_p3:=s3; v_s_base_w1:=sw1; v_s_base_w2:=sw2;
            v_s_base_missing_p1:=sm1; v_s_base_missing_p2:=sm2; v_s_base_missing_p3:=sm3; v_s_base_missing_w1:=smw1; v_s_base_missing_w2:=smw2;
        ELSIF v_set = 'ix' THEN
            v_ix_p1:=a1; v_ix_p3:=a3; v_ix_p5:=a5; v_ix_w1:=aw1; v_ix_w3:=aw3;
            v_ix_missing_p1:=m1; v_ix_missing_p3:=m3; v_ix_missing_p5:=m5; v_ix_missing_w1:=mw1; v_ix_missing_w3:=mw3;
            v_s_ix_p1:=s1; v_s_ix_p2:=s2; v_s_ix_p3:=s3; v_s_ix_w1:=sw1; v_s_ix_w2:=sw2;
            v_s_ix_missing_p1:=sm1; v_s_ix_missing_p2:=sm2; v_s_ix_missing_p3:=sm3; v_s_ix_missing_w1:=smw1; v_s_ix_missing_w2:=smw2;
        ELSE
            v_upr_p1:=a1; v_upr_p3:=a3; v_upr_p5:=a5; v_upr_w1:=aw1; v_upr_w3:=aw3;
            v_upr_missing_p1:=m1; v_upr_missing_p3:=m3; v_upr_missing_p5:=m5; v_upr_missing_w1:=mw1; v_upr_missing_w3:=mw3;
            v_s_upr_p1:=s1; v_s_upr_p2:=s2; v_s_upr_p3:=s3; v_s_upr_w1:=sw1; v_s_upr_w2:=sw2;
            v_s_upr_missing_p1:=sm1; v_s_upr_missing_p2:=sm2; v_s_upr_missing_p3:=sm3; v_s_upr_missing_w1:=smw1; v_s_upr_missing_w2:=smw2;
        END IF;
    END LOOP;

    -- Leader track tiers
    IF v_base_p1 < 8 THEN v_base_play_tier:='Silver'; v_base_play_cur:=v_base_p1; v_base_play_missing:=v_base_missing_p1;
    ELSIF v_base_p3 < 8 THEN v_base_play_tier:='Gold'; v_base_play_cur:=v_base_p3; v_base_play_missing:=v_base_missing_p3;
    ELSE v_base_play_tier:='Platinum'; v_base_play_cur:=v_base_p5; v_base_play_missing:=v_base_missing_p5; END IF;
    IF v_ix_p1 < 6 THEN v_ix_play_tier:='Silver'; v_ix_play_cur:=v_ix_p1; v_ix_play_missing:=v_ix_missing_p1;
    ELSIF v_ix_p3 < 6 THEN v_ix_play_tier:='Gold'; v_ix_play_cur:=v_ix_p3; v_ix_play_missing:=v_ix_missing_p3;
    ELSE v_ix_play_tier:='Platinum'; v_ix_play_cur:=v_ix_p5; v_ix_play_missing:=v_ix_missing_p5; END IF;
    IF v_upr_p1 < 9 THEN v_upr_play_tier:='Silver'; v_upr_play_cur:=v_upr_p1; v_upr_play_missing:=v_upr_missing_p1;
    ELSIF v_upr_p3 < 9 THEN v_upr_play_tier:='Gold'; v_upr_play_cur:=v_upr_p3; v_upr_play_missing:=v_upr_missing_p3;
    ELSE v_upr_play_tier:='Platinum'; v_upr_play_cur:=v_upr_p5; v_upr_play_missing:=v_upr_missing_p5; END IF;
    IF v_s_base_p1 < 8 THEN v_s_base_play_tier:='Silver'; v_s_base_play_cur:=v_s_base_p1; v_s_base_play_missing:=v_s_base_missing_p1;
    ELSIF v_s_base_p2 < 8 THEN v_s_base_play_tier:='Gold'; v_s_base_play_cur:=v_s_base_p2; v_s_base_play_missing:=v_s_base_missing_p2;
    ELSE v_s_base_play_tier:='Platinum'; v_s_base_play_cur:=v_s_base_p3; v_s_base_play_missing:=v_s_base_missing_p3; END IF;
    IF v_s_ix_p1 < 6 THEN v_s_ix_play_tier:='Silver'; v_s_ix_play_cur:=v_s_ix_p1; v_s_ix_play_missing:=v_s_ix_missing_p1;
    ELSIF v_s_ix_p2 < 6 THEN v_s_ix_play_tier:='Gold'; v_s_ix_play_cur:=v_s_ix_p2; v_s_ix_play_missing:=v_s_ix_missing_p2;
    ELSE v_s_ix_play_tier:='Platinum'; v_s_ix_play_cur:=v_s_ix_p3; v_s_ix_play_missing:=v_s_ix_missing_p3; END IF;
    IF v_s_upr_p1 < 9 THEN v_s_upr_play_tier:='Silver'; v_s_upr_play_cur:=v_s_upr_p1; v_s_upr_play_missing:=v_s_upr_missing_p1;
    ELSIF v_s_upr_p2 < 9 THEN v_s_upr_play_tier:='Gold'; v_s_upr_play_cur:=v_s_upr_p2; v_s_upr_play_missing:=v_s_upr_missing_p2;
    ELSE v_s_upr_play_tier:='Platinum'; v_s_upr_play_cur:=v_s_upr_p3; v_s_upr_play_missing:=v_s_upr_missing_p3; END IF;
    IF v_base_w1 < 8 THEN v_base_win_tier:='Gold'; v_base_win_cur:=v_base_w1; v_base_win_missing:=v_base_missing_w1;
    ELSE v_base_win_tier:='Platinum'; v_base_win_cur:=v_base_w3; v_base_win_missing:=v_base_missing_w3; END IF;
    IF v_ix_w1 < 6 THEN v_ix_win_tier:='Gold'; v_ix_win_cur:=v_ix_w1; v_ix_win_missing:=v_ix_missing_w1;
    ELSE v_ix_win_tier:='Platinum'; v_ix_win_cur:=v_ix_w3; v_ix_win_missing:=v_ix_missing_w3; END IF;
    IF v_upr_w1 < 9 THEN v_upr_win_tier:='Gold'; v_upr_win_cur:=v_upr_w1; v_upr_win_missing:=v_upr_missing_w1;
    ELSE v_upr_win_tier:='Platinum'; v_upr_win_cur:=v_upr_w3; v_upr_win_missing:=v_upr_missing_w3; END IF;
    IF v_s_base_w1 < 8 THEN v_s_base_win_tier:='Gold'; v_s_base_win_cur:=v_s_base_w1; v_s_base_win_missing:=v_s_base_missing_w1;
    ELSE v_s_base_win_tier:='Platinum'; v_s_base_win_cur:=v_s_base_w2; v_s_base_win_missing:=v_s_base_missing_w2; END IF;
    IF v_s_ix_w1 < 6 THEN v_s_ix_win_tier:='Gold'; v_s_ix_win_cur:=v_s_ix_w1; v_s_ix_win_missing:=v_s_ix_missing_w1;
    ELSE v_s_ix_win_tier:='Platinum'; v_s_ix_win_cur:=v_s_ix_w2; v_s_ix_win_missing:=v_s_ix_missing_w2; END IF;
    IF v_s_upr_w1 < 9 THEN v_s_upr_win_tier:='Gold'; v_s_upr_win_cur:=v_s_upr_w1; v_s_upr_win_missing:=v_s_upr_missing_w1;
    ELSE v_s_upr_win_tier:='Platinum'; v_s_upr_win_cur:=v_s_upr_w2; v_s_upr_win_missing:=v_s_upr_missing_w2; END IF;

    -- Streaks (chronological)
    WITH o AS (
      SELECT r.placement, row_number() OVER (ORDER BY g.created_at, g.id) rn
        FROM public.game_results r JOIN public.games g ON g.id = r.game_id
       WHERE lower(trim(r.player_name)) = v_key)
    SELECT COALESCE((SELECT max(c) FROM (SELECT count(*) c FROM (SELECT rn - row_number() OVER (ORDER BY rn) grp FROM o WHERE placement = 1) a GROUP BY grp) b),0),
           COALESCE((SELECT max(c) FROM (SELECT count(*) c FROM (SELECT rn - row_number() OVER (ORDER BY rn) grp FROM o WHERE placement <= 2) a GROUP BY grp) b),0)
      INTO v_max_win_streak, v_max_top2_streak;

    -- Opponents & rivals
    SELECT count(DISTINCT lower(trim(r2.player_name))),
           count(DISTINCT lower(trim(r2.player_name))) FILTER (WHERE g.created_at >= v_season_start AND g.created_at < v_season_end)
      INTO v_unique_opponents, v_s_unique_opponents
      FROM public.game_results r1 JOIN public.game_results r2 ON r2.game_id = r1.game_id AND r2.id <> r1.id
      JOIN public.games g ON g.id = r1.game_id
     WHERE lower(trim(r1.player_name)) = v_key AND lower(trim(r2.player_name)) <> v_key;
    SELECT COALESCE(sum(n),0), COALESCE(array_agg(nm ORDER BY n DESC),'{}') INTO v_top3_rival_games, v_top3_rival_names FROM (
      SELECT min(r2.player_name) nm, count(*) n FROM public.game_results r1
        JOIN public.game_results r2 ON r2.game_id = r1.game_id AND r2.id <> r1.id
       WHERE lower(trim(r1.player_name)) = v_key AND lower(trim(r2.player_name)) <> v_key
       GROUP BY lower(trim(r2.player_name)) ORDER BY count(*) DESC LIMIT 3) t;
    SELECT COALESCE(sum(n),0), COALESCE(array_agg(nm ORDER BY n DESC),'{}') INTO v_s_top3_rival_games, v_s_top3_rival_names FROM (
      SELECT min(r2.player_name) nm, count(*) n FROM public.game_results r1
        JOIN public.game_results r2 ON r2.game_id = r1.game_id AND r2.id <> r1.id
        JOIN public.games g ON g.id = r1.game_id
       WHERE lower(trim(r1.player_name)) = v_key AND lower(trim(r2.player_name)) <> v_key
         AND g.created_at >= v_season_start AND g.created_at < v_season_end
       GROUP BY lower(trim(r2.player_name)) ORDER BY count(*) DESC LIMIT 3) t;

    -- Community & tournaments (SP ledger)
    SELECT count(*) FILTER (WHERE action_type = 'daily_check_in'),
           count(*) FILTER (WHERE action_type = 'daily_check_in' AND created_at >= v_season_start AND created_at < v_season_end),
           count(*) FILTER (WHERE action_type IN ('referral_signup','referral_signup_new_user')),
           count(*) FILTER (WHERE action_type IN ('referral_signup','referral_signup_new_user') AND created_at >= v_season_start AND created_at < v_season_end),
           count(DISTINCT ref_tournament_num) FILTER (WHERE action_type = 'tournament_semifinals_reached'),
           count(DISTINCT ref_tournament_num) FILTER (WHERE action_type = 'tournament_grand_finals_reached'),
           count(DISTINCT ref_tournament_num) FILTER (WHERE action_type = 'tournament_grand_finals_won')
      INTO v_checkins, v_s_checkins, v_referrals, v_s_referrals, v_semis_reached, v_finals_reached, v_tourneys_won
      FROM public.sp_events WHERE lower(trim(player_key)) = v_key;
    SELECT count(DISTINCT tournament_num) INTO v_tourneys_entered FROM public.tournament_matches WHERE lower(trim(player_name)) = v_key;
    v_semis_reached := GREATEST(v_semis_reached, v_finals_reached);

    -- Volume targets / tiers
    SELECT CASE WHEN v_total_games<10 THEN 10 WHEN v_total_games<50 THEN 50 WHEN v_total_games<150 THEN 150 ELSE 300 END,
           CASE WHEN v_total_games<10 THEN 'Bronze' WHEN v_total_games<50 THEN 'Silver' WHEN v_total_games<150 THEN 'Gold' ELSE 'Platinum' END INTO v_total_games_target, v_total_games_tier;
    SELECT CASE WHEN v_s_total_games<5 THEN 5 WHEN v_s_total_games<20 THEN 20 WHEN v_s_total_games<50 THEN 50 ELSE 100 END,
           CASE WHEN v_s_total_games<5 THEN 'Bronze' WHEN v_s_total_games<20 THEN 'Silver' WHEN v_s_total_games<50 THEN 'Gold' ELSE 'Platinum' END INTO v_s_games_target, v_s_games_tier;
    SELECT CASE WHEN v_base_games<10 THEN 10 WHEN v_base_games<50 THEN 50 WHEN v_base_games<150 THEN 150 ELSE 300 END,
           CASE WHEN v_base_games<10 THEN 'Bronze' WHEN v_base_games<50 THEN 'Silver' WHEN v_base_games<150 THEN 'Gold' ELSE 'Platinum' END INTO v_base_games_target, v_base_games_tier;
    SELECT CASE WHEN v_s_base_games<5 THEN 5 WHEN v_s_base_games<20 THEN 20 WHEN v_s_base_games<50 THEN 50 ELSE 100 END,
           CASE WHEN v_s_base_games<5 THEN 'Bronze' WHEN v_s_base_games<20 THEN 'Silver' WHEN v_s_base_games<50 THEN 'Gold' ELSE 'Platinum' END INTO v_s_base_games_target, v_s_base_games_tier;
    SELECT CASE WHEN v_ix_games<10 THEN 10 WHEN v_ix_games<50 THEN 50 ELSE 150 END,
           CASE WHEN v_ix_games<10 THEN 'Silver' WHEN v_ix_games<50 THEN 'Gold' ELSE 'Platinum' END INTO v_ix_games_target, v_ix_games_tier;
    SELECT CASE WHEN v_s_ix_games<5 THEN 5 WHEN v_s_ix_games<15 THEN 15 ELSE 30 END,
           CASE WHEN v_s_ix_games<5 THEN 'Silver' WHEN v_s_ix_games<15 THEN 'Gold' ELSE 'Platinum' END INTO v_s_ix_games_target, v_s_ix_games_tier;
    SELECT CASE WHEN v_upr_games<10 THEN 10 WHEN v_upr_games<50 THEN 50 ELSE 150 END,
           CASE WHEN v_upr_games<10 THEN 'Silver' WHEN v_upr_games<50 THEN 'Gold' ELSE 'Platinum' END INTO v_upr_games_target, v_upr_games_tier;
    SELECT CASE WHEN v_s_upr_games<5 THEN 5 WHEN v_s_upr_games<15 THEN 15 ELSE 30 END,
           CASE WHEN v_s_upr_games<5 THEN 'Silver' WHEN v_s_upr_games<15 THEN 'Gold' ELSE 'Platinum' END INTO v_s_upr_games_target, v_s_upr_games_tier;
    SELECT CASE WHEN v_immo_games<5 THEN 5 WHEN v_immo_games<15 THEN 15 ELSE 35 END,
           CASE WHEN v_immo_games<5 THEN 'Silver' WHEN v_immo_games<15 THEN 'Gold' ELSE 'Platinum' END INTO v_immo_target, v_immo_tier;
    SELECT CASE WHEN v_s_immo_games<3 THEN 3 WHEN v_s_immo_games<15 THEN 15 ELSE 30 END,
           CASE WHEN v_s_immo_games<3 THEN 'Silver' WHEN v_s_immo_games<15 THEN 'Gold' ELSE 'Platinum' END INTO v_s_immo_target, v_s_immo_tier;
    SELECT CASE WHEN v_epic_games<5 THEN 5 WHEN v_epic_games<10 THEN 10 ELSE 25 END,
           CASE WHEN v_epic_games<5 THEN 'Silver' WHEN v_epic_games<10 THEN 'Gold' ELSE 'Platinum' END INTO v_epic_target, v_epic_tier;
    SELECT CASE WHEN v_s_epic_games<3 THEN 3 WHEN v_s_epic_games<10 THEN 10 ELSE 20 END,
           CASE WHEN v_s_epic_games<3 THEN 'Silver' WHEN v_s_epic_games<10 THEN 'Gold' ELSE 'Platinum' END INTO v_s_epic_target, v_s_epic_tier;
    SELECT CASE WHEN v_checkins<5 THEN 5 WHEN v_checkins<15 THEN 15 WHEN v_checkins<30 THEN 30 ELSE 60 END,
           CASE WHEN v_checkins<5 THEN 'Bronze' WHEN v_checkins<15 THEN 'Silver' WHEN v_checkins<30 THEN 'Gold' ELSE 'Platinum' END INTO v_checkin_target, v_checkin_tier;
    SELECT CASE WHEN v_s_checkins<3 THEN 3 WHEN v_s_checkins<7 THEN 7 WHEN v_s_checkins<15 THEN 15 ELSE 30 END,
           CASE WHEN v_s_checkins<3 THEN 'Bronze' WHEN v_s_checkins<7 THEN 'Silver' WHEN v_s_checkins<15 THEN 'Gold' ELSE 'Platinum' END INTO v_s_checkin_target, v_s_checkin_tier;
    SELECT CASE WHEN v_unique_opponents<10 THEN 10 WHEN v_unique_opponents<50 THEN 50 WHEN v_unique_opponents<150 THEN 150 ELSE 300 END,
           CASE WHEN v_unique_opponents<10 THEN 'Bronze' WHEN v_unique_opponents<50 THEN 'Silver' WHEN v_unique_opponents<150 THEN 'Gold' ELSE 'Platinum' END INTO v_opponents_target, v_opponents_tier;
    SELECT CASE WHEN v_s_unique_opponents<5 THEN 5 WHEN v_s_unique_opponents<20 THEN 20 WHEN v_s_unique_opponents<50 THEN 50 ELSE 100 END,
           CASE WHEN v_s_unique_opponents<5 THEN 'Bronze' WHEN v_s_unique_opponents<20 THEN 'Silver' WHEN v_s_unique_opponents<50 THEN 'Gold' ELSE 'Platinum' END INTO v_s_opponents_target, v_s_opponents_tier;
    SELECT CASE WHEN v_top3_rival_games<10 THEN 10 WHEN v_top3_rival_games<25 THEN 25 WHEN v_top3_rival_games<50 THEN 50 ELSE 100 END,
           CASE WHEN v_top3_rival_games<10 THEN 'Bronze' WHEN v_top3_rival_games<25 THEN 'Silver' WHEN v_top3_rival_games<50 THEN 'Gold' ELSE 'Platinum' END INTO v_rival_target, v_rival_tier;
    SELECT CASE WHEN v_s_top3_rival_games<5 THEN 5 WHEN v_s_top3_rival_games<10 THEN 10 WHEN v_s_top3_rival_games<20 THEN 20 ELSE 40 END,
           CASE WHEN v_s_top3_rival_games<5 THEN 'Bronze' WHEN v_s_top3_rival_games<10 THEN 'Silver' WHEN v_s_top3_rival_games<20 THEN 'Gold' ELSE 'Platinum' END INTO v_s_rival_target, v_s_rival_tier;
    SELECT CASE WHEN v_wins_15plus_vp<1 THEN 1 WHEN v_wins_15plus_vp<3 THEN 3 ELSE 7 END,
           CASE WHEN v_wins_15plus_vp<1 THEN 'Silver' WHEN v_wins_15plus_vp<3 THEN 'Gold' ELSE 'Platinum' END INTO v_vp15_target, v_vp15_tier;
    SELECT CASE WHEN v_max_top2_streak<4 THEN 4 WHEN v_max_top2_streak<8 THEN 8 ELSE 15 END,
           CASE WHEN v_max_top2_streak<4 THEN 'Silver' WHEN v_max_top2_streak<8 THEN 'Gold' ELSE 'Platinum' END INTO v_top2_streak_target, v_top2_streak_tier;
    SELECT CASE WHEN v_tourneys_entered<1 THEN 1 WHEN v_tourneys_entered<3 THEN 3 WHEN v_tourneys_entered<7 THEN 7 ELSE 12 END,
           CASE WHEN v_tourneys_entered<1 THEN 'Bronze' WHEN v_tourneys_entered<3 THEN 'Silver' WHEN v_tourneys_entered<7 THEN 'Gold' ELSE 'Platinum' END,
           CASE WHEN v_tourneys_entered<1 THEN 'Common' WHEN v_tourneys_entered<3 THEN 'Uncommon' WHEN v_tourneys_entered<7 THEN 'Rare' ELSE 'Legendary' END
      INTO v_tourney_target, v_tourney_tier, v_tourney_rarity;
    IF v_semis_reached < 1 THEN v_tourney_stage_target:=1; v_tourney_stage_tier:='Silver'; v_tourney_stage_cur:=v_semis_reached;
    ELSIF v_finals_reached < 1 THEN v_tourney_stage_target:=1; v_tourney_stage_tier:='Gold'; v_tourney_stage_cur:=v_finals_reached; v_tourney_stage_desc:='Reach a Grand Final in an official tournament.';
    ELSE v_tourney_stage_target:=3; v_tourney_stage_tier:='Platinum'; v_tourney_stage_cur:=LEAST(v_finals_reached,3); v_tourney_stage_desc:='Reach 3 Grand Finals in official tournaments.'; END IF;
    IF v_tourneys_won < 1 THEN v_tourney_win_target:=1; v_tourney_win_tier:='Gold'; ELSE v_tourney_win_target:=3; v_tourney_win_tier:='Platinum'; END IF;
    END;

    $c$;
d := replace(d, '-- 4. Construct Output Payload', c || '-- 4. Construct Output Payload');
d := replace(d, 'RETURN jsonb_build_object(''player_key''',
  'SELECT count(*) INTO v_rare_badges_earned FROM jsonb_array_elements(v_achievements) e WHERE e->>''rarity'' IN (''Rare'',''Legendary'') AND (e->>''is_unlocked'')::boolean;
    RETURN jsonb_build_object(''player_key''');
EXECUTE d;
END $do$;