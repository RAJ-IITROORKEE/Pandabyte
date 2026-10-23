-- Keep direct SDK uploads within the same size/type/path bounds as the app.
CREATE POLICY private_account_files_limits ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket <> 'private-account-files'
  OR (
    size BETWEEN 1 AND 65536
    AND mime_type = 'text/plain'
    AND key ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]txt$'
  )
);
