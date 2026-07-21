-- Allow admins to write to leader image buckets; everyone can read paths (signed URLs are used at fetch time anyway)
CREATE POLICY "Admins can manage leader-portraits"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'leader-portraits' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'leader-portraits' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage leader-cards"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'leader-cards' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'leader-cards' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anyone can view leader-portraits"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'leader-portraits');

CREATE POLICY "Anyone can view leader-cards"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'leader-cards');
