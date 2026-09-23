ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tournament_host';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tournament_moderator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'match_moderator';