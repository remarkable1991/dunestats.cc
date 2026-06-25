
ALTER TABLE public.player_ratings
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_player_ratings_claimed_by ON public.player_ratings(claimed_by);
CREATE INDEX IF NOT EXISTS idx_player_ratings_player_key ON public.player_ratings(player_key);

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS board_version text CHECK (board_version IN ('base','uprising')),
  ADD COLUMN IF NOT EXISTS has_rise_of_ix boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_epic_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_immortality boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_base_leaders boolean NOT NULL DEFAULT false;
