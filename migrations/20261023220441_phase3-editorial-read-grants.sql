-- Apply after bucket creation; restrictive anon policy permits only published editorial objects.
-- Customer buckets remain excluded by editorial_media_anon_only.
GRANT USAGE ON SCHEMA storage TO anon;
GRANT SELECT ON storage.objects TO anon;
