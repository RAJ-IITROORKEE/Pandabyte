-- Canonical P4 staging only. No promotion or live indexing is enabled.
CREATE TABLE public.panda_agent_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 canonical_url text NOT NULL UNIQUE CHECK (canonical_url ~ '^https://(www\.)?pandabyte\.in/product-page/[a-zA-Z0-9_-]+/?$' AND length(canonical_url)<=500),
 product_id uuid, product_kind text NOT NULL DEFAULT 'product' CHECK(product_kind='product'),
 rights_status text NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','permitted','denied')),
 review_state text NOT NULL DEFAULT 'discovered' CHECK(review_state IN ('discovered','approved','rejected')),
 evidence text CHECK(length(evidence)<=1000), reason text CHECK(length(reason)<=500), reviewed_at timestamptz, reviewed_by text CHECK(reviewed_by='project_admin'),
 eligibility_generation bigint NOT NULL DEFAULT 1 CHECK(eligibility_generation>0), version bigint NOT NULL DEFAULT 1,
 withdrawn_at timestamptz, deleted_at timestamptz,
 FOREIGN KEY(product_id,product_kind) REFERENCES public.cms_records(id,kind) ON DELETE RESTRICT
);
CREATE TABLE public.panda_agent_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES public.panda_agent_sources(id),
 parent_id uuid, product_id uuid, catalog_revision_id uuid,
 artifact_key text NOT NULL CHECK(artifact_key ~ '^[0-9a-f]{64}$'),
 original_hash text NOT NULL CHECK(original_hash ~ '^[0-9a-f]{64}$'), original_length bigint NOT NULL CHECK(original_length>=0),
 normalized_text text CHECK(octet_length(normalized_text)<=1000000), purged_at timestamptz,
 normalized_hash text NOT NULL CHECK(normalized_hash ~ '^[0-9a-f]{64}$' AND (normalized_text IS NULL OR normalized_hash=encode(sha256(convert_to(normalized_text,'UTF8')),'hex'))),
 CHECK((normalized_text IS NULL)=(purged_at IS NOT NULL)),
 parser text NOT NULL CHECK(length(parser) BETWEEN 1 AND 200), config_hash text NOT NULL CHECK(config_hash ~ '^[0-9a-f]{64}$'),
 provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(provenance)='object' AND octet_length(provenance::text)<=8192),
 scope text NOT NULL CHECK(scope IN ('product_listing','technical')), physical_revision text CHECK(length(physical_revision)<=200),
 state text NOT NULL DEFAULT 'quarantined' CHECK(state IN ('quarantined','validated','approved','rejected')),
 withdrawn_at timestamptz, deleted_at timestamptz, review_reason text CHECK(length(review_reason)<=500), reviewed_at timestamptz, reviewed_by text CHECK(reviewed_by='project_admin'), version bigint NOT NULL DEFAULT 1,
 UNIQUE(source_id,id), UNIQUE(source_id,artifact_key),
 FOREIGN KEY(source_id,parent_id) REFERENCES public.panda_agent_versions(source_id,id),
 FOREIGN KEY(product_id,catalog_revision_id) REFERENCES public.cms_revisions(record_id,id) ON DELETE RESTRICT,
 CHECK(catalog_revision_id IS NULL OR product_id IS NOT NULL)
);
CREATE TABLE public.panda_agent_chunks (
 document_version_id uuid NOT NULL REFERENCES public.panda_agent_versions(id),
 logical_chunk_id text NOT NULL CHECK(logical_chunk_id ~ '^[0-9a-f]{64}$'),
 chunk_version_id text NOT NULL CHECK(chunk_version_id ~ '^[0-9a-f]{64}$'),
 chunk_text text CHECK(octet_length(chunk_text) BETWEEN 1 AND 100000), purged_at timestamptz,
 text_hash text NOT NULL CHECK(text_hash ~ '^[0-9a-f]{64}$' AND (chunk_text IS NULL OR text_hash=encode(sha256(convert_to(chunk_text,'UTF8')),'hex'))),
 CHECK((chunk_text IS NULL)=(purged_at IS NOT NULL)),
 locator text NOT NULL CHECK(length(locator) BETWEEN 1 AND 1000),
 PRIMARY KEY(document_version_id,logical_chunk_id)
);
CREATE TABLE public.panda_agent_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 config_hash text NOT NULL CHECK(config_hash ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'candidate' CHECK(state IN ('candidate','invalidated')), sealed boolean NOT NULL DEFAULT false, member_count integer NOT NULL DEFAULT 0 CHECK(member_count>=0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(manifest_hash,config_hash)
);
CREATE TABLE public.panda_agent_release_items (
 release_id uuid NOT NULL REFERENCES public.panda_agent_releases(id),
 document_version_id uuid NOT NULL, logical_chunk_id text NOT NULL,
 text_hash text NOT NULL CHECK(text_hash ~ '^[0-9a-f]{64}$'), generation bigint NOT NULL CHECK(generation>0),
 PRIMARY KEY(release_id,document_version_id,logical_chunk_id),
 FOREIGN KEY(document_version_id,logical_chunk_id) REFERENCES public.panda_agent_chunks(document_version_id,logical_chunk_id)
);
CREATE TABLE public.panda_agent_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage text NOT NULL CHECK(stage IN ('fetch','normalize','chunk','lexical','vector','evaluate','purge')),
 input_key text NOT NULL UNIQUE CHECK(input_key ~ '^[0-9a-f]{64}$'), input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 source_id uuid REFERENCES public.panda_agent_sources(id), document_version_id uuid, release_id uuid REFERENCES public.panda_agent_releases(id),
 generation bigint, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), fence bigint NOT NULL DEFAULT 0,
 lease_owner text, lease_token uuid, lease_expires timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 output_hash text CHECK(output_hash ~ '^[0-9a-f]{64}$'), receipt jsonb CHECK(octet_length(receipt::text)<=4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_id,document_version_id) REFERENCES public.panda_agent_versions(source_id,id),
 CHECK(document_version_id IS NULL OR source_id IS NOT NULL), CHECK(source_id IS NULL OR generation IS NOT NULL)
);
CREATE INDEX panda_agent_jobs_runnable ON public.panda_agent_jobs(next_attempt_at,id) WHERE status IN ('queued','running');
CREATE INDEX panda_agent_versions_source ON public.panda_agent_versions(source_id);
CREATE INDEX panda_agent_items_chunk ON public.panda_agent_release_items(document_version_id,logical_chunk_id);

ALTER TABLE public.panda_agent_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_release_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_sources, public.panda_agent_versions, public.panda_agent_chunks, public.panda_agent_jobs, public.panda_agent_releases, public.panda_agent_release_items FROM PUBLIC, anon, authenticated;

-- Operator-only APIs: the caller is authorized by EXECUTE grants, never an actor parameter.
CREATE FUNCTION public.panda_agent_register_source(p_url text,p_product uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_sources%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 INSERT INTO public.panda_agent_sources(canonical_url,product_id) VALUES(p_url,p_product) ON CONFLICT(canonical_url) DO NOTHING;
 SELECT * INTO STRICT r FROM public.panda_agent_sources WHERE canonical_url=p_url;
 IF r.product_id IS DISTINCT FROM p_product OR r.withdrawn_at IS NOT NULL OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'source identity conflict'; END IF;
 RETURN r.id;
END $$;
CREATE FUNCTION public.panda_agent_store_version(p_source uuid,p_parent uuid,p_product uuid,p_revision uuid,p_artifact text,p_original_hash text,p_length bigint,p_text text,p_hash text,p_parser text,p_config text,p_scope text,p_physical text,p_provenance jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_sources%ROWTYPE; v public.panda_agent_versions%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT * INTO STRICT s FROM public.panda_agent_sources WHERE id=p_source FOR UPDATE;
 IF s.product_id IS DISTINCT FROM p_product OR s.withdrawn_at IS NOT NULL OR s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'source ineligible'; END IF;
 INSERT INTO public.panda_agent_versions(source_id,parent_id,product_id,catalog_revision_id,artifact_key,original_hash,original_length,normalized_text,normalized_hash,parser,config_hash,scope,physical_revision,provenance)
 VALUES(p_source,p_parent,p_product,p_revision,p_artifact,p_original_hash,p_length,p_text,p_hash,p_parser,p_config,p_scope,p_physical,p_provenance) ON CONFLICT(source_id,artifact_key) DO NOTHING;
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id=p_source AND artifact_key=p_artifact;
 IF (v.parent_id,v.product_id,v.catalog_revision_id,v.original_hash,v.original_length,v.normalized_text,v.normalized_hash,v.parser,v.config_hash,v.scope,v.physical_revision,v.provenance) IS DISTINCT FROM (p_parent,p_product,p_revision,p_original_hash,p_length,p_text,p_hash,p_parser,p_config,p_scope,p_physical,p_provenance) THEN RAISE EXCEPTION 'artifact identity conflict'; END IF;
 RETURN v.id;
END $$;
CREATE FUNCTION public.panda_agent_add_chunk(p_version uuid,p_logical text,p_chunk text,p_text text,p_hash text,p_locator text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v public.panda_agent_versions%ROWTYPE; c public.panda_agent_chunks%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE id=p_version FOR UPDATE;
 IF v.state <> 'quarantined' OR v.withdrawn_at IS NOT NULL OR v.deleted_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.panda_agent_sources s WHERE s.id=v.source_id AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL) THEN RAISE EXCEPTION 'version ineligible'; END IF;
 INSERT INTO public.panda_agent_chunks(document_version_id,logical_chunk_id,chunk_version_id,chunk_text,text_hash,locator) VALUES(p_version,p_logical,p_chunk,p_text,p_hash,p_locator) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT c FROM public.panda_agent_chunks WHERE document_version_id=p_version AND logical_chunk_id=p_logical;
 IF (c.chunk_version_id,c.chunk_text,c.text_hash,c.locator) IS DISTINCT FROM (p_chunk,p_text,p_hash,p_locator) THEN RAISE EXCEPTION 'chunk identity conflict'; END IF;
END $$;
CREATE FUNCTION public.panda_agent_enqueue_job(p_stage text,p_key text,p_hash text,p_source uuid,p_version uuid,p_release uuid,p_generation bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.panda_agent_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_stage IS NULL OR p_stage NOT IN ('fetch','normalize','chunk','lexical','vector','evaluate','purge') OR (p_stage IN ('fetch','normalize','chunk','purge') AND (p_source IS NULL OR p_generation IS NULL OR p_release IS NOT NULL)) OR (p_stage IN ('normalize','chunk') AND p_version IS NULL) OR (p_stage='fetch' AND p_version IS NOT NULL) OR (p_stage IN ('lexical','vector','evaluate') AND (p_release IS NULL OR p_source IS NOT NULL OR p_version IS NOT NULL OR p_generation IS NOT NULL)) THEN RAISE EXCEPTION 'invalid stage inputs'; END IF;
 IF p_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.panda_agent_sources WHERE id=p_source AND eligibility_generation=p_generation AND (p_stage='purge' OR (review_state='approved' AND rights_status='permitted' AND withdrawn_at IS NULL AND deleted_at IS NULL))) THEN RAISE EXCEPTION 'source ineligible'; END IF;
 IF p_version IS NOT NULL AND p_stage<>'purge' AND NOT EXISTS(SELECT 1 FROM public.panda_agent_versions WHERE id=p_version AND source_id=p_source AND withdrawn_at IS NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'version ineligible'; END IF;
 IF p_release IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.panda_agent_releases WHERE id=p_release AND state='candidate' AND sealed) THEN RAISE EXCEPTION 'release ineligible'; END IF;
 INSERT INTO public.panda_agent_jobs(stage,input_key,input_hash,source_id,document_version_id,release_id,generation) VALUES(p_stage,p_key,p_hash,p_source,p_version,p_release,p_generation) ON CONFLICT(input_key) DO NOTHING;
 SELECT * INTO STRICT j FROM public.panda_agent_jobs WHERE input_key=p_key;
 IF (j.stage,j.input_hash,j.source_id,j.document_version_id,j.release_id,j.generation) IS DISTINCT FROM (p_stage,p_hash,p_source,p_version,p_release,p_generation) THEN RAISE EXCEPTION 'job identity conflict'; END IF;
 RETURN j.id;
END $$;
CREATE FUNCTION public.panda_agent_claim_job(p_owner text) RETURNS TABLE(job_id uuid,token uuid,fencing bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.panda_agent_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid worker'; END IF;
 UPDATE public.panda_agent_jobs SET status='failed',lease_owner=NULL,lease_token=NULL,lease_expires=NULL WHERE status='running' AND lease_expires<=clock_timestamp() AND attempts>=3;
 SELECT q.* INTO j FROM public.panda_agent_jobs q WHERE (q.status='queued' AND q.next_attempt_at<=clock_timestamp() OR q.status='running' AND q.lease_expires<=clock_timestamp()) AND q.attempts<3 AND (q.document_version_id IS NULL OR q.stage='purge' OR EXISTS(SELECT 1 FROM public.panda_agent_versions v WHERE v.id=q.document_version_id AND v.source_id=q.source_id AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL)) AND (q.release_id IS NULL OR EXISTS(SELECT 1 FROM public.panda_agent_releases r WHERE r.id=q.release_id AND r.state='candidate' AND r.sealed)) AND (q.source_id IS NULL OR EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=q.source_id AND s.eligibility_generation=q.generation AND (q.stage='purge' OR (s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL)))) ORDER BY q.next_attempt_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.panda_agent_jobs SET status='running',attempts=attempts+1,fence=fence+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires=clock_timestamp()+interval '2 minutes' WHERE id=j.id RETURNING id,lease_token,fence INTO job_id,token,fencing;
 RETURN NEXT;
END $$;
CREATE FUNCTION public.panda_agent_finish_job(p_id uuid,p_token uuid,p_fence bigint,p_action text,p_hash text DEFAULT NULL,p_receipt jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.panda_agent_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT * INTO STRICT j FROM public.panda_agent_jobs WHERE id=p_id FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.fence IS DISTINCT FROM p_fence OR j.lease_expires<=clock_timestamp() OR (j.document_version_id IS NOT NULL AND j.stage<>'purge' AND NOT EXISTS(SELECT 1 FROM public.panda_agent_versions v WHERE v.id=j.document_version_id AND v.source_id=j.source_id AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL)) OR (j.release_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.panda_agent_releases r WHERE r.id=j.release_id AND r.state='candidate' AND r.sealed)) OR (j.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=j.source_id AND s.eligibility_generation=j.generation AND (j.stage='purge' OR (s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL)))) THEN RAISE EXCEPTION 'stale lease'; END IF;
 IF p_action='heartbeat' THEN UPDATE public.panda_agent_jobs SET lease_expires=clock_timestamp()+interval '2 minutes' WHERE id=p_id;
 ELSIF p_action='fail' THEN UPDATE public.panda_agent_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END, next_attempt_at=clock_timestamp()+make_interval(secs=>least(300, 10 * (2 ^ attempts)::integer)),lease_owner=NULL,lease_token=NULL,lease_expires=NULL WHERE id=p_id;
 ELSIF p_action='complete' AND j.stage<>'purge' AND p_hash ~ '^[0-9a-f]{64}$' AND p_receipt IS NOT NULL THEN UPDATE public.panda_agent_jobs SET status='succeeded',output_hash=p_hash,receipt=p_receipt,lease_token=NULL WHERE id=p_id;
 ELSE RAISE EXCEPTION 'invalid action'; END IF;
END $$;
CREATE FUNCTION public.panda_agent_revoke_source(p_id uuid,p_expected bigint,p_delete boolean,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_delete IS NULL THEN RAISE EXCEPTION 'invalid reason'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 UPDATE public.panda_agent_sources SET withdrawn_at=now(),deleted_at=CASE WHEN p_delete THEN now() ELSE deleted_at END,reason=p_reason,version=version+1,eligibility_generation=eligibility_generation+1 WHERE id=p_id AND version=p_expected AND withdrawn_at IS NULL AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or withdrawn source'; END IF;
 UPDATE public.panda_agent_jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE source_id=p_id AND status IN ('queued','running');
 UPDATE public.panda_agent_releases r SET state='invalidated' WHERE r.state='candidate' AND EXISTS(SELECT 1 FROM public.panda_agent_release_items i JOIN public.panda_agent_versions v ON v.id=i.document_version_id WHERE i.release_id=r.id AND v.source_id=p_id);
 UPDATE public.panda_agent_jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE status IN ('queued','running') AND release_id IN (SELECT id FROM public.panda_agent_releases WHERE state='invalidated');
END $$;
-- Erases retained SQL text only. External object deletion and read-back are separate.
CREATE FUNCTION public.panda_agent_purge_retained_text(p_id uuid,p_token uuid,p_fence bigint,p_hash text,p_receipt jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.panda_agent_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT * INTO STRICT j FROM public.panda_agent_jobs WHERE id=p_id FOR UPDATE;
 IF j.stage<>'purge' OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.fence IS DISTINCT FROM p_fence OR j.lease_expires<=clock_timestamp() OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_receipt IS NULL OR jsonb_typeof(p_receipt)<>'object' OR coalesce(p_receipt->>'external_status','') NOT IN ('not_attempted','pending','acknowledged','failed') OR octet_length(p_receipt::text)>4000 OR NOT EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=j.source_id AND s.eligibility_generation=j.generation AND (s.deleted_at IS NOT NULL OR (j.document_version_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.panda_agent_versions v WHERE v.id=j.document_version_id AND v.source_id=s.id AND v.deleted_at IS NOT NULL)))) THEN RAISE EXCEPTION 'invalid purge or stale lease'; END IF;
 UPDATE public.panda_agent_chunks c SET chunk_text=NULL,purged_at=clock_timestamp() FROM public.panda_agent_versions v WHERE c.document_version_id=v.id AND v.source_id=j.source_id AND (j.document_version_id IS NULL OR v.id=j.document_version_id) AND c.chunk_text IS NOT NULL;
 UPDATE public.panda_agent_versions v SET normalized_text=NULL,purged_at=clock_timestamp(),version=version+1 WHERE v.source_id=j.source_id AND (j.document_version_id IS NULL OR v.id=j.document_version_id) AND v.normalized_text IS NOT NULL;
 UPDATE public.panda_agent_jobs SET status='succeeded',output_hash=p_hash,receipt=p_receipt,lease_owner=NULL,lease_token=NULL,lease_expires=NULL WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_purge_retained_text(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_purge_retained_text(uuid,uuid,bigint,text,jsonb) TO project_admin;
-- There is deliberately no promotion or adapter-receipt API; fixtures cannot open the live gate.
REVOKE ALL ON FUNCTION public.panda_agent_register_source(text,uuid), public.panda_agent_store_version(uuid,uuid,uuid,uuid,text,text,bigint,text,text,text,text,text,text,jsonb), public.panda_agent_add_chunk(uuid,text,text,text,text,text), public.panda_agent_enqueue_job(text,text,text,uuid,uuid,uuid,bigint), public.panda_agent_claim_job(text), public.panda_agent_finish_job(uuid,uuid,bigint,text,text,jsonb), public.panda_agent_revoke_source(uuid,bigint,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_register_source(text,uuid), public.panda_agent_store_version(uuid,uuid,uuid,uuid,text,text,bigint,text,text,text,text,text,text,jsonb), public.panda_agent_add_chunk(uuid,text,text,text,text,text), public.panda_agent_enqueue_job(text,text,text,uuid,uuid,uuid,bigint), public.panda_agent_claim_job(text), public.panda_agent_finish_job(uuid,uuid,bigint,text,text,jsonb), public.panda_agent_revoke_source(uuid,bigint,boolean,text) TO project_admin;





-- Owner is trusted for DDL, but ordinary DML still preserves evidence and tombstones.
CREATE FUNCTION public.panda_agent_guard_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'evidence cannot be deleted'; END IF;
 IF TG_TABLE_NAME='panda_agent_sources' THEN
  IF (NEW.id,NEW.canonical_url,NEW.product_id,NEW.product_kind) IS DISTINCT FROM (OLD.id,OLD.canonical_url,OLD.product_id,OLD.product_kind)
   OR NEW.version<=OLD.version OR NEW.eligibility_generation<OLD.eligibility_generation
   OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
   OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
   OR ((NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) AND NEW.eligibility_generation<=OLD.eligibility_generation)
   OR (NEW.review_state<>OLD.review_state AND NOT (OLD.review_state='discovered' AND NEW.review_state IN ('approved','rejected'))) THEN RAISE EXCEPTION 'immutable source or tombstone'; END IF;
 ELSIF TG_TABLE_NAME='panda_agent_versions' THEN
  IF (to_jsonb(NEW)-ARRAY['state','withdrawn_at','deleted_at','version','review_reason','reviewed_at','reviewed_by','normalized_text','purged_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','withdrawn_at','deleted_at','version','review_reason','reviewed_at','reviewed_by','normalized_text','purged_at'])
   OR NEW.version<=OLD.version OR ((NEW.normalized_text,NEW.purged_at) IS DISTINCT FROM (OLD.normalized_text,OLD.purged_at) AND NOT (OLD.normalized_text IS NOT NULL AND OLD.purged_at IS NULL AND NEW.normalized_text IS NULL AND NEW.purged_at IS NOT NULL AND (OLD.deleted_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=OLD.source_id AND s.deleted_at IS NOT NULL)))) OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
   OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
   OR (NEW.state<>OLD.state AND NOT ((OLD.state='quarantined' AND NEW.state='validated') OR (OLD.state='validated' AND NEW.state IN ('approved','rejected')))) THEN RAISE EXCEPTION 'immutable version or tombstone'; END IF;
 ELSIF TG_TABLE_NAME='panda_agent_chunks' THEN
  IF (to_jsonb(NEW)-ARRAY['chunk_text','purged_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['chunk_text','purged_at']) OR NOT (OLD.chunk_text IS NOT NULL AND OLD.purged_at IS NULL AND NEW.chunk_text IS NULL AND NEW.purged_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.panda_agent_versions v JOIN public.panda_agent_sources s ON s.id=v.source_id WHERE v.id=OLD.document_version_id AND (v.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL))) THEN RAISE EXCEPTION 'immutable chunk'; END IF;
 ELSIF TG_TABLE_NAME='panda_agent_jobs' THEN
  IF OLD.status='succeeded' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'completed job immutable'; END IF;
  IF (NEW.id,NEW.stage,NEW.input_key,NEW.input_hash,NEW.source_id,NEW.document_version_id,NEW.release_id,NEW.generation,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.stage,OLD.input_key,OLD.input_hash,OLD.source_id,OLD.document_version_id,OLD.release_id,OLD.generation,OLD.created_at) OR NEW.fence<OLD.fence OR NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'immutable job identity'; END IF;
 ELSIF TG_TABLE_NAME='panda_agent_releases' THEN
  IF (NEW.id,NEW.manifest_hash,NEW.config_hash,NEW.member_count,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.manifest_hash,OLD.config_hash,OLD.member_count,OLD.created_at) OR (OLD.sealed AND NOT NEW.sealed) OR (OLD.state='invalidated' AND NEW.state<>'invalidated') THEN RAISE EXCEPTION 'immutable release'; END IF;
 ELSE RAISE EXCEPTION 'immutable evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER panda_sources_guard BEFORE UPDATE OR DELETE ON public.panda_agent_sources FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE TRIGGER panda_versions_guard BEFORE UPDATE OR DELETE ON public.panda_agent_versions FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE TRIGGER panda_chunks_guard BEFORE UPDATE OR DELETE ON public.panda_agent_chunks FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE TRIGGER panda_jobs_guard BEFORE UPDATE OR DELETE ON public.panda_agent_jobs FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE TRIGGER panda_releases_guard BEFORE UPDATE OR DELETE ON public.panda_agent_releases FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE TRIGGER panda_items_guard BEFORE UPDATE OR DELETE ON public.panda_agent_release_items FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_evidence();
CREATE FUNCTION public.panda_agent_guard_item_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_releases r WHERE r.id=NEW.release_id AND NOT r.sealed AND r.state='candidate') OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chunks c JOIN public.panda_agent_versions v ON v.id=c.document_version_id JOIN public.panda_agent_sources s ON s.id=v.source_id WHERE c.document_version_id=NEW.document_version_id AND c.logical_chunk_id=NEW.logical_chunk_id AND c.text_hash=NEW.text_hash AND s.eligibility_generation=NEW.generation AND s.review_state='approved' AND s.rights_status='permitted' AND s.product_id IS NOT NULL AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL AND v.state='approved' AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL) THEN RAISE EXCEPTION 'invalid release item'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER panda_items_insert_guard BEFORE INSERT ON public.panda_agent_release_items FOR EACH ROW EXECUTE FUNCTION public.panda_agent_guard_item_insert();

CREATE FUNCTION public.panda_agent_review_source(p_id uuid,p_expected bigint,p_action text,p_evidence text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_action IS NULL OR p_action NOT IN ('approve','reject') OR (p_action='approve' AND (p_evidence IS NULL OR length(p_evidence) NOT BETWEEN 1 AND 1000)) THEN RAISE EXCEPTION 'invalid review'; END IF;
 UPDATE public.panda_agent_sources SET review_state=CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END, rights_status=CASE p_action WHEN 'approve' THEN 'permitted' ELSE 'denied' END,evidence=p_evidence,reason=p_reason,reviewed_at=now(),reviewed_by='project_admin',version=version+1 WHERE id=p_id AND version=p_expected AND review_state='discovered' AND withdrawn_at IS NULL AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or ineligible source'; END IF;
END $$;
-- The digest is sha256 of sorted logical-id:text-hash:locator lines joined by newline.
CREATE FUNCTION public.panda_agent_seal_version(p_id uuid,p_expected bigint,p_count integer,p_digest text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n bigint; d text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=p_id;
 IF p_count IS NULL OR p_count<1 OR n<>p_count OR p_digest IS DISTINCT FROM d THEN RAISE EXCEPTION 'chunk coverage mismatch'; END IF;
 UPDATE public.panda_agent_versions v SET state='validated',version=version+1 WHERE v.id=p_id AND v.version=p_expected AND v.state='quarantined' AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=v.source_id AND s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or ineligible version'; END IF;
END $$;
CREATE FUNCTION public.panda_agent_review_version(p_id uuid,p_expected bigint,p_action text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_action IS NULL OR p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid review'; END IF;
 UPDATE public.panda_agent_versions v SET state=CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,review_reason=p_reason,reviewed_at=now(),reviewed_by='project_admin',version=version+1 WHERE v.id=p_id AND v.version=p_expected AND v.state='validated' AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.panda_agent_sources s WHERE s.id=v.source_id AND s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or ineligible version'; END IF;
END $$;
CREATE FUNCTION public.panda_agent_revoke_version(p_id uuid,p_expected bigint,p_delete boolean,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE sid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_delete IS NULL THEN RAISE EXCEPTION 'invalid reason'; END IF;
 UPDATE public.panda_agent_versions SET withdrawn_at=now(),deleted_at=CASE WHEN p_delete THEN now() ELSE NULL END,review_reason=p_reason,reviewed_at=now(),reviewed_by='project_admin',version=version+1 WHERE id=p_id AND version=p_expected AND withdrawn_at IS NULL AND deleted_at IS NULL RETURNING source_id INTO sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or withdrawn version'; END IF;
 UPDATE public.panda_agent_sources SET eligibility_generation=eligibility_generation+1,version=version+1,reason=p_reason WHERE id=sid;
 UPDATE public.panda_agent_jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE source_id=sid AND status IN ('queued','running');
 UPDATE public.panda_agent_releases r SET state='invalidated' WHERE r.state='candidate' AND EXISTS(SELECT 1 FROM public.panda_agent_release_items i JOIN public.panda_agent_versions v ON v.id=i.document_version_id WHERE i.release_id=r.id AND v.source_id=sid);
 UPDATE public.panda_agent_jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE status IN ('queued','running') AND release_id IN (SELECT id FROM public.panda_agent_releases WHERE state='invalidated');
END $$;
CREATE FUNCTION public.panda_agent_cancel_job(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 UPDATE public.panda_agent_jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE id=p_id AND status IN ('queued','running');
 IF NOT FOUND THEN RAISE EXCEPTION 'job not cancellable'; END IF;
END $$;
-- Manifest digest: sha256(config hash + newline + sorted version:logical:hash:generation lines).
CREATE FUNCTION public.panda_agent_seal_candidate(p_config text,p_manifest text,p_count integer,p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rid uuid; n bigint; digest text; existing public.panda_agent_releases%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 IF p_config IS NULL OR p_manifest IS NULL OR p_items IS NULL OR p_config !~ '^[0-9a-f]{64}$' OR p_manifest !~ '^[0-9a-f]{64}$' OR p_count IS NULL OR p_count<1 OR p_count>10000 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<>p_count THEN RAISE EXCEPTION 'invalid candidate'; END IF;
 SELECT count(*),encode(sha256(convert_to(p_config||E'\n'||coalesce(string_agg((x->>'version')::uuid::text||':'||(x->>'logical')||':'||(x->>'hash')||':'||(x->>'generation')::bigint::text,E'\n' ORDER BY (x->>'version')::uuid,x->>'logical'),''),'UTF8')),'hex') INTO n,digest FROM jsonb_array_elements(p_items) x;
 IF n<>p_count OR digest IS DISTINCT FROM p_manifest THEN RAISE EXCEPTION 'manifest mismatch'; END IF;
 INSERT INTO public.panda_agent_releases(manifest_hash,config_hash,member_count) VALUES(p_manifest,p_config,p_count) ON CONFLICT(manifest_hash,config_hash) DO NOTHING RETURNING id INTO rid;
 IF rid IS NULL THEN
  SELECT * INTO STRICT existing FROM public.panda_agent_releases WHERE manifest_hash=p_manifest AND config_hash=p_config FOR UPDATE;
  IF existing.state<>'candidate' OR NOT existing.sealed OR existing.member_count<>p_count THEN RAISE EXCEPTION 'candidate identity conflict'; END IF;
  SELECT count(*),encode(sha256(convert_to(p_config||E'\n'||coalesce(string_agg(i.document_version_id::text||':'||i.logical_chunk_id||':'||i.text_hash||':'||i.generation::text,E'\n' ORDER BY i.document_version_id,i.logical_chunk_id),''),'UTF8')),'hex') INTO n,digest FROM public.panda_agent_release_items i WHERE i.release_id=existing.id;
  IF n<>p_count OR digest IS DISTINCT FROM p_manifest OR EXISTS(SELECT 1 FROM public.panda_agent_release_items i JOIN public.panda_agent_chunks c ON (c.document_version_id,c.logical_chunk_id)=(i.document_version_id,i.logical_chunk_id) JOIN public.panda_agent_versions v ON v.id=i.document_version_id JOIN public.panda_agent_sources s ON s.id=v.source_id WHERE i.release_id=existing.id AND (c.text_hash<>i.text_hash OR s.eligibility_generation<>i.generation OR s.review_state<>'approved' OR s.rights_status<>'permitted' OR s.product_id IS NULL OR s.withdrawn_at IS NOT NULL OR s.deleted_at IS NOT NULL OR v.state<>'approved' OR v.withdrawn_at IS NOT NULL OR v.deleted_at IS NOT NULL)) THEN RAISE EXCEPTION 'candidate no longer eligible'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.panda_agent_release_items(release_id,document_version_id,logical_chunk_id,text_hash,generation)
 SELECT rid,(x->>'version')::uuid,x->>'logical',x->>'hash',(x->>'generation')::bigint FROM jsonb_array_elements(p_items) x;
 SELECT count(*),encode(sha256(convert_to(p_config||E'\n'||coalesce(string_agg(document_version_id::text||':'||logical_chunk_id||':'||text_hash||':'||generation::text,E'\n' ORDER BY document_version_id,logical_chunk_id),''),'UTF8')),'hex') INTO n,digest FROM public.panda_agent_release_items WHERE release_id=rid;
 IF n<>p_count OR digest IS DISTINCT FROM p_manifest THEN RAISE EXCEPTION 'manifest mismatch'; END IF;
 UPDATE public.panda_agent_releases SET sealed=true WHERE id=rid;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_guard_evidence(), public.panda_agent_guard_item_insert(), public.panda_agent_review_source(uuid,bigint,text,text,text), public.panda_agent_seal_version(uuid,bigint,integer,text), public.panda_agent_review_version(uuid,bigint,text,text), public.panda_agent_revoke_version(uuid,bigint,boolean,text), public.panda_agent_cancel_job(uuid), public.panda_agent_seal_candidate(text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_review_source(uuid,bigint,text,text,text), public.panda_agent_seal_version(uuid,bigint,integer,text), public.panda_agent_review_version(uuid,bigint,text,text), public.panda_agent_revoke_version(uuid,bigint,boolean,text), public.panda_agent_cancel_job(uuid), public.panda_agent_seal_candidate(text,text,integer,jsonb) TO project_admin;










