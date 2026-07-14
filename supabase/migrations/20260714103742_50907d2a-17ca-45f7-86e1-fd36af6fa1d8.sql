
CREATE OR REPLACE FUNCTION public.seed_tournament_from_bitmap(p jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g jsonb := p->'grid';
  rs jsonb := p->'rows';
  r jsonb;
  bm bytea;
  arr jsonb;
  i int;
  gsize int := jsonb_array_length(g);
  n int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rs) LOOP
    bm := decode(r->>'bm', 'base64');
    arr := '[]'::jsonb;
    FOR i IN 0..gsize-1 LOOP
      IF get_bit(bm, i) = 1 THEN
        arr := arr || jsonb_build_array(g->>i);
      END IF;
    END LOOP;
    INSERT INTO public.tournament_matches
      (tournament_num,round_type,table_identifier,player_name,discord_username,table_score,player_compatibility_score,player_availability)
    VALUES ((r->>'tn')::int, r->>'rt', r->>'ti', r->>'pn', NULLIF(r->>'du',''), (r->>'ts')::int, (r->>'pcs')::int, arr);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.seed_tournament_from_bitmap(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_tournament_from_bitmap(jsonb) TO anon, authenticated;
