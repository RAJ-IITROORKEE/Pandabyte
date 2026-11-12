-- DRAFT, NOT APPLIED. Needs owner approval and the control room's agreement on who calls it.
-- Kept outside migrations/ so it cannot be applied by accident.
-- Additive and read-only: published catalog rows and approved listing passages for the research host, with no user
-- identity. It reuses the existing candidate and eligibility checks, so it can never return more than the signed-in
-- website RAG already reads. It returns no database ids, hashes or release details.

CREATE FUNCTION public.panda_agent_public_products() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases;
BEGIN
 r:=public.panda_agent_runtime_candidate();
 RETURN (SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('sku',sku,'title',title,'sourceUrl',source_url) ORDER BY title,sku),'[]'::jsonb))
  FROM (SELECT DISTINCT sku,title,source_url FROM public.panda_agent_runtime_eligible(r.id)) q);
END $$;

-- One product's passages by exact SKU. Listing prices are removed here so no caller can receive them.
-- Case-sensitive on purpose: "Rs 250" is a price, "RS485" is not. Residual: a bare number with no currency word
-- (for example "only 499") is not removed. Untested in PostgreSQL; run against real listing text before applying.
CREATE FUNCTION public.panda_agent_public_passages(p_sku text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; result jsonb;
BEGIN
 IF p_sku IS NULL OR length(p_sku) NOT BETWEEN 1 AND 128 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 r:=public.panda_agent_runtime_candidate();
 SELECT jsonb_build_object('sku',min(sku),'title',min(title),'sourceUrl',min(source_url),
  'passages',jsonb_agg(jsonb_build_object('capturedAt',captured_at,
   'text',regexp_replace(chunk_text,'(?:(?:₹|\mRs\.?|\mINR|\mMRP|\m(?:Sale |Regular )?[Pp]rice)\s*:?\s*[0-9][0-9,]*(?:\.[0-9]+)?(?:/-)?|[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:INR|Rs\.?)(?![A-Za-z0-9]))','[price removed]','g')) ORDER BY document_version_id,logical_chunk_id))
 INTO result FROM public.panda_agent_runtime_eligible(r.id) WHERE lower(sku)=lower(p_sku)
 HAVING count(*)>0 AND count(DISTINCT product_id)=1 AND count(DISTINCT source_url)=1;
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_public_products(),public.panda_agent_public_passages(text) FROM PUBLIC,anon,authenticated;
-- Open decision: which role the host uses. anon is shown because the data is already public listing content;
-- do not give the host an admin key for this.
GRANT EXECUTE ON FUNCTION public.panda_agent_public_products(),public.panda_agent_public_passages(text) TO anon;
