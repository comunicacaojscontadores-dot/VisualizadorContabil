
-- 1) Remove overly permissive SELECT policies on demonstrativos.
--    Public access is handled by a server function using the service role,
--    which scopes the query to a specific slug + status='publicado'.
DROP POLICY IF EXISTS demos_public_published ON public.demonstrativos;
DROP POLICY IF EXISTS demos_public_published_auth ON public.demonstrativos;

-- 2) Explicit UPDATE policy on storage.objects for the 'docs' bucket,
--    mirroring the existing INSERT/DELETE owner-scoped checks.
DROP POLICY IF EXISTS "docs_owner_update" ON storage.objects;
CREATE POLICY "docs_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
