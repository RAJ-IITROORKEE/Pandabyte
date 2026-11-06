-- Publish the additive native RPCs to the existing PostgREST gateway after commit.
-- No data, grants, provider configuration or runtime activation changes.
NOTIFY pgrst, 'reload schema';
