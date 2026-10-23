-- Bucket creation can install permissive owner policies; these guards must AND them.
CREATE POLICY private_account_files_boundary ON storage.objects
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  bucket <> 'private-account-files'
  OR (
    uploaded_by = (SELECT public.requesting_user_id())
    AND split_part(key, '/', 1) = (SELECT public.requesting_user_id())
  )
)
WITH CHECK (
  bucket <> 'private-account-files'
  OR (
    uploaded_by = (SELECT public.requesting_user_id())
    AND split_part(key, '/', 1) = (SELECT public.requesting_user_id())
  )
);

CREATE POLICY private_account_files_immutable ON storage.objects
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket <> 'private-account-files')
WITH CHECK (bucket <> 'private-account-files');
