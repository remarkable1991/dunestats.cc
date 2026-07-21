DROP POLICY IF EXISTS "Admins can manage leader-cards" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage leader-portraits" ON storage.objects;

CREATE POLICY "Admins can manage leader-cards" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'leader-cards' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'leader-cards' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage leader-portraits" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'leader-portraits' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'leader-portraits' AND public.has_role(auth.uid(), 'admin'::public.app_role));