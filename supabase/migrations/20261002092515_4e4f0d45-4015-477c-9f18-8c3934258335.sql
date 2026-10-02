CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign text NOT NULL,
  user_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX email_outbox_status_idx ON public.email_outbox (status, created_at);
CREATE INDEX email_outbox_sent_idx ON public.email_outbox (sent_at);

CREATE TABLE public.news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_posts TO anon, authenticated;
GRANT ALL ON public.news_posts TO service_role;
ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "News is publicly readable" ON public.news_posts FOR SELECT TO anon, authenticated USING (true);