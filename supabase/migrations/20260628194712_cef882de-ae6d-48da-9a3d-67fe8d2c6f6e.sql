
CREATE POLICY "match_screenshots_auth_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'match-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "match_screenshots_auth_read"
ON storage.objects FOR SELECT TO authenticated, anon
USING (bucket_id = 'match-screenshots');

CREATE POLICY "match_screenshots_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'match-screenshots' AND owner = auth.uid());
