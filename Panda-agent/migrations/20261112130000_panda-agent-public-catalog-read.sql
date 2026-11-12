-- Owner-approved 12 Nov 2026 ("Yes, apply it"). Rollback: DROP FUNCTION for both functions below.
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
-- (for example "only 499") is not removed. Checked in PostgreSQL on 12 Nov 2026 with 16 literal samples (prices removed, RS485 and units kept); the 284 real eligible chunks contain no price text, so this is a safety net.
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
 -- The two blocked logical chunks the website removes in code (BLOCKED_LOGICAL_IDS) are excluded here too.
 AND logical_chunk_id NOT IN ('21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4','3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac')
 HAVING count(*)>0 AND count(DISTINCT product_id)=1 AND count(DISTINCT source_url)=1;
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_public_products(),public.panda_agent_public_passages(text) FROM PUBLIC,anon,authenticated;
-- anon only: the data is already public listing content, and the host must never hold an admin key for this.
GRANT EXECUTE ON FUNCTION public.panda_agent_public_products(),public.panda_agent_public_passages(text) TO anon;
