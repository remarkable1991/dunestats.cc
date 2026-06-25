
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- enum for game version
CREATE TYPE public.game_version AS ENUM ('base', 'ix', 'uprising');

-- games
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_version public.game_version NOT NULL,
  source TEXT NOT NULL DEFAULT 'screenshot',
  image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.games TO authenticated;
GRANT SELECT ON public.games TO anon;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_public_read" ON public.games FOR SELECT USING (true);
CREATE POLICY "games_auth_insert" ON public.games FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- game_results
CREATE TABLE public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  placement INT NOT NULL CHECK (placement BETWEEN 1 AND 8),
  player_name TEXT NOT NULL,
  leader_name TEXT,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_results_game_idx ON public.game_results(game_id);
CREATE INDEX game_results_player_idx ON public.game_results(lower(player_name));
GRANT SELECT, INSERT ON public.game_results TO authenticated;
GRANT SELECT ON public.game_results TO anon;
GRANT ALL ON public.game_results TO service_role;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_results_public_read" ON public.game_results FOR SELECT USING (true);
CREATE POLICY "game_results_auth_insert" ON public.game_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.created_by = auth.uid()));

-- player_ratings
CREATE TABLE public.player_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  game_version public.game_version NOT NULL,
  elo NUMERIC(10,2) NOT NULL DEFAULT 1000,
  games_played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  top2 INT NOT NULL DEFAULT 0,
  total_points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_key, game_version)
);
CREATE INDEX player_ratings_version_elo_idx ON public.player_ratings(game_version, elo DESC);
GRANT SELECT ON public.player_ratings TO anon, authenticated;
GRANT ALL ON public.player_ratings TO service_role;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_ratings_public_read" ON public.player_ratings FOR SELECT USING (true);

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
