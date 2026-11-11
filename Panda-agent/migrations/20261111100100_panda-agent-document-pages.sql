-- Text-first page/image index for future visual RAG. Rollback: DROP both functions, then the table.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public.panda_agent_document_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES public.panda_agent_sources(id) ON DELETE CASCADE,
 page_number integer NOT NULL CHECK(page_number>0),
 kind text NOT NULL CHECK(kind IN ('pdf_page','image')),
 page_text text CHECK(length(page_text)<=20000),
 caption text CHECK(length(caption)<=2000),
 storage_key text CHECK(length(storage_key)<=500),
 content_sha256 text CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 embedding vector(1024),
 search tsvector GENERATED ALWAYS AS (to_tsvector('pg_catalog.simple'::regconfig,coalesce(page_text,'')||' '||coalesce(caption,''))) STORED,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,kind,page_number)
);
CREATE INDEX panda_agent_document_pages_search ON public.panda_agent_document_pages USING gin(search);
-- shortcut: no ANN index, add HNSW once pages exceed ~10k
ALTER TABLE public.panda_agent_document_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_document_pages FROM PUBLIC,anon,authenticated;

-- Writes use the same privileged path as chunks: a SECURITY DEFINER RPC executable only by project_admin.
CREATE FUNCTION public.panda_agent_add_document_page(p_source uuid,p_page integer,p_kind text,p_text text,p_caption text,p_key text,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 INSERT INTO public.panda_agent_document_pages(source_id,page_number,kind,page_text,caption,storage_key,content_sha256)
 VALUES(p_source,p_page,p_kind,p_text,p_caption,p_key,p_hash)
 ON CONFLICT(source_id,kind,page_number) DO UPDATE SET page_text=excluded.page_text,caption=excluded.caption,storage_key=excluded.storage_key,content_sha256=excluded.content_sha256,embedding=NULL;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_add_document_page(uuid,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_add_document_page(uuid,integer,text,text,text,text,text) TO project_admin;

CREATE FUNCTION public.panda_agent_document_page_search(p_query text,p_limit integer DEFAULT 5) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE q tsquery; result jsonb;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 2 AND 200 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN PERFORM public.phase3_fail('invalid'); END IF;
 q:=websearch_to_tsquery('pg_catalog.simple'::regconfig,p_query);
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'pageNumber',page_number,'kind',kind,'excerpt',excerpt,'caption',caption,'rank',rank) ORDER BY rank DESC,source_id,page_number),'[]'::jsonb) INTO result
 FROM (SELECT p.source_id,p.page_number,p.kind,left(coalesce(p.page_text,''),600) excerpt,p.caption,ts_rank(p.search,q) rank
  FROM public.panda_agent_document_pages p JOIN public.panda_agent_sources s ON s.id=p.source_id
  -- Same source rule as panda_agent_runtime_eligible (runtime-reads migration).
  WHERE p.search @@ q AND s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL
  ORDER BY rank DESC,p.source_id,p.page_number LIMIT p_limit) t;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_document_page_search(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_document_page_search(text,integer) TO authenticated;
