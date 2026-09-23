ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS preview_text_template text,
  ADD COLUMN IF NOT EXISTS text_template text;