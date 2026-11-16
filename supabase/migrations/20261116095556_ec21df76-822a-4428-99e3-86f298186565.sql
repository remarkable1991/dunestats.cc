DROP FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text);
DROP POLICY "Anyone can submit a pending donation" ON public.donations;
REVOKE INSERT ON public.donations FROM anon, authenticated;

CREATE FUNCTION donations_internal.submit_donation(
  p_donor_name text,
  p_player_key text,
  p_amount numeric,
  p_currency text,
  p_tournament_pct integer,
  p_maintenance_pct integer,
  p_developer_pct integer,
  p_hide_name boolean,
  p_hide_amount boolean,
  p_payment_method text,
  p_donor_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_season_id integer;
  v_name text := trim(p_donor_name);
  v_note text := nullif(trim(p_donor_note), '');
BEGIN
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Please enter a donor name between 2 and 80 characters';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Please enter a valid donation amount';
  END IF;
  IF p_currency NOT IN ('USD', 'EUR', 'GBP') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF p_tournament_pct < 0 OR p_maintenance_pct < 0 OR p_developer_pct < 0
     OR p_tournament_pct > 100 OR p_maintenance_pct > 100 OR p_developer_pct > 100
     OR p_tournament_pct + p_maintenance_pct + p_developer_pct <> 100 THEN
    RAISE EXCEPTION 'Allocation percentages must add up to 100';
  END IF;
  IF p_payment_method NOT IN ('paypal', 'revolut', 'steam', 'gift_card', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Payment note is too long';
  END IF;
  IF p_player_key IS NOT NULL AND char_length(p_player_key) > 100 THEN
    RAISE EXCEPTION 'Player name is too long';
  END IF;

  SELECT s.id INTO v_season_id
  FROM public.sp_seasons s
  WHERE now() >= s.starts_at AND now() < s.ends_at
  ORDER BY s.id DESC
  LIMIT 1;

  INSERT INTO public.donations (
    donor_name, player_key, user_id, amount, currency,
    tournament_pct, maintenance_pct, developer_pct,
    hide_name, hide_amount, payment_method, donor_note,
    status, season_id, donated_at
  ) VALUES (
    v_name, nullif(lower(trim(p_player_key)), ''), auth.uid(), round(p_amount, 2), p_currency,
    p_tournament_pct, p_maintenance_pct, p_developer_pct,
    p_hide_name, p_hide_amount, p_payment_method, v_note,
    'pending', v_season_id, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.submit_donation(
  p_donor_name text,
  p_player_key text,
  p_amount numeric,
  p_currency text,
  p_tournament_pct integer,
  p_maintenance_pct integer,
  p_developer_pct integer,
  p_hide_name boolean,
  p_hide_amount boolean,
  p_payment_method text,
  p_donor_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT donations_internal.submit_donation(
    p_donor_name, p_player_key, p_amount, p_currency,
    p_tournament_pct, p_maintenance_pct, p_developer_pct,
    p_hide_name, p_hide_amount, p_payment_method, p_donor_note
  );
$$;

REVOKE ALL ON FUNCTION donations_internal.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION donations_internal.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) TO anon, authenticated, service_role;
