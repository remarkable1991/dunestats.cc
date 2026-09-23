ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lfg_live_emails_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lfg_async_emails_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS game_result_emails_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS news_emails_opt_in boolean NOT NULL DEFAULT true;