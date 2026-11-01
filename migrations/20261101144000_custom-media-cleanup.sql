-- A custom media creator can compensate its own unregistered uploads only.
-- Keep the existing public/media publication and customer bucket boundaries.
ALTER POLICY editorial_media_cleanup_boundary ON storage.objects USING (
 bucket<>'editorial-media' OR (public.media_storage_allowed(key,'delete') AND (
 NOT COALESCE((public.staff_permission_snapshot()->>'custom')::boolean,false)
 OR uploaded_by=public.requesting_user_id())));
