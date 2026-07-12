
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_player_key text,
  ADD COLUMN IF NOT EXISTS referral_phase1_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_phase2_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_signup_sp integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sp_register_referral(p_referrer_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_key text := lower(btrim(p_referrer_key));
  v_referrer_user uuid;
  v_already boolean;
  v_new_user_key text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF v_key IS NULL OR v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_key');
  END IF;

  SELECT referral_phase1_paid INTO v_already FROM public.profiles WHERE id = v_user;
  IF COALESCE(v_already, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_registered');
  END IF;

  SELECT claimed_by INTO v_referrer_user
    FROM public.player_ratings WHERE player_key = v_key LIMIT 1;

  IF v_referrer_user IS NOT NULL AND v_referrer_user = v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key = v_key)
     AND NOT EXISTS (SELECT 1 FROM public.player_sp WHERE player_key = v_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_referrer');
  END IF;

  UPDATE public.profiles
    SET referred_by_player_key = v_key,
        referral_phase1_paid = true,
        pending_signup_sp = pending_signup_sp + 50,
        updated_at = now()
    WHERE id = v_user;

  PERFORM public.sp_award(v_key, 'referral_signup', 100, now(), NULL, NULL,
    jsonb_build_object('referee_user', v_user));

  -- If the new user already has a claimed player, release +50 immediately
  SELECT player_key INTO v_new_user_key
    FROM public.player_ratings WHERE claimed_by = v_user ORDER BY elo DESC LIMIT 1;
  IF v_new_user_key IS NOT NULL THEN
    PERFORM public.sp_award(v_new_user_key, 'referral_signup_new_user', 50, now(), NULL, NULL,
      jsonb_build_object('referrer_key', v_key));
    UPDATE public.profiles
      SET pending_signup_sp = GREATEST(0, pending_signup_sp - 50), updated_at = now()
      WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_key', v_key);
END; $$;

REVOKE ALL ON FUNCTION public.sp_register_referral(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_register_referral(text) TO authenticated;

-- Release queued +50 SP when the new user claims their first player_ratings row
CREATE OR REPLACE FUNCTION public.sp_release_pending_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending integer; v_referrer text;
BEGIN
  IF NEW.claimed_by IS NOT NULL
     AND (OLD.claimed_by IS NULL OR OLD.claimed_by IS DISTINCT FROM NEW.claimed_by) THEN
    SELECT pending_signup_sp, referred_by_player_key INTO v_pending, v_referrer
      FROM public.profiles WHERE id = NEW.claimed_by;
    IF COALESCE(v_pending, 0) > 0 THEN
      PERFORM public.sp_award(NEW.player_key, 'referral_signup_new_user', v_pending, now(), NULL, NULL,
        jsonb_build_object('referrer_key', v_referrer));
      UPDATE public.profiles SET pending_signup_sp = 0, updated_at = now() WHERE id = NEW.claimed_by;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sp_release_pending ON public.player_ratings;
CREATE TRIGGER sp_release_pending AFTER UPDATE OF claimed_by ON public.player_ratings
  FOR EACH ROW EXECUTE FUNCTION public.sp_release_pending_signup();

-- Phase 2: +500 jackpot when the referred friend crosses 100 lifetime SP
CREATE OR REPLACE FUNCTION public.sp_check_referral_jackpot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_referrer text; v_paid boolean;
BEGIN
  IF NEW.lifetime_sp >= 100
     AND (OLD.lifetime_sp IS NULL OR OLD.lifetime_sp < 100)
     AND NEW.claimed_by IS NOT NULL THEN
    v_user := NEW.claimed_by;
    SELECT referred_by_player_key, referral_phase2_paid INTO v_referrer, v_paid
      FROM public.profiles WHERE id = v_user;
    IF v_referrer IS NOT NULL AND NOT COALESCE(v_paid, false) THEN
      PERFORM public.sp_award(v_referrer, 'referral_jackpot', 500, now(), NULL, NULL,
        jsonb_build_object('referee_user', v_user));
      UPDATE public.profiles SET referral_phase2_paid = true, updated_at = now() WHERE id = v_user;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sp_referral_jackpot ON public.player_sp;
CREATE TRIGGER sp_referral_jackpot AFTER UPDATE OF lifetime_sp ON public.player_sp
  FOR EACH ROW EXECUTE FUNCTION public.sp_check_referral_jackpot();
